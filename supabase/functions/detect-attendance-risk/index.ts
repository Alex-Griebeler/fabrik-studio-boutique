import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  evaluateAll,
  isWithinSendWindow,
  type AttendanceEvent,
  type RiskAlert,
} from "../_shared/attendance/detection.ts";
import {
  buildTrainerAlertMessage,
  type AlertMessageContext,
} from "../_shared/attendance/messaging.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────── Tipos auxiliares ───────────
interface AgentPolicies {
  mode: "shadow" | "live";
  shadowPhone: string;
  silenceWindowDays: number;
  escalationHours: number;
  fallbackTrainerId: string | null;
  sendWindow: { start_hour: number; end_hour: number; days_of_week: number[] };
  timezone: string;
  lookbackDays: number;
}

interface StudentInfo {
  id: string;
  full_name: string;
  is_active: boolean;
}

interface TrainerInfo {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
}

interface PlanSnapshot {
  plan_name: string;
  category: string;
  frequency: string | null;
}

// ─────────── Entry point ───────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: requer service_role bearer (cron) OU dry-run flag
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError(401, "Missing Authorization");
    }
    const token = authHeader.replace("Bearer ", "");
    if (token !== serviceKey) {
      return jsonError(403, "Service-role required");
    }

    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      forceMode?: "shadow" | "live";
    };

    const policies = await loadPolicies(supabase);
    const effectiveMode = body.forceMode ?? policies.mode;

    // Janela de envio: se fora, ainda detectamos e gravamos, mas não disparamos.
    const nowInTz = nowInTimezone(policies.timezone);
    const inSendWindow = isWithinSendWindow(nowInTz, {
      startHour: policies.sendWindow.start_hour,
      endHour: policies.sendWindow.end_hour,
      daysOfWeek: policies.sendWindow.days_of_week,
    });

    const eventsByStudent = await loadAttendanceEvents(supabase, policies.lookbackDays);
    const alerts = evaluateAll(eventsByStudent);

    const summary = {
      students_evaluated: eventsByStudent.size,
      alerts_detected: alerts.length,
      mode: effectiveMode,
      in_send_window: inSendWindow,
      dry_run: !!body.dryRun,
      created: 0,
      suppressed: 0,
      sent: 0,
      skipped_existing: 0,
      errors: [] as string[],
    };

    if (alerts.length === 0) {
      return jsonOk(summary);
    }

    // Pré-carrega contexto: students, trainers, planos do contrato ativo
    const studentIds = alerts.map((a) => a.studentId);
    const [students, plansByStudent, trainers] = await Promise.all([
      loadStudents(supabase, studentIds),
      loadActivePlanByStudent(supabase, studentIds),
      loadTrainers(supabase),
    ]);

    const ackBaseUrl = `${supabaseUrl}/functions/v1/acknowledge-attendance-alert`;

    for (const alert of alerts) {
      try {
        const student = students.get(alert.studentId);
        if (!student || !student.is_active) {
          summary.suppressed++;
          continue;
        }

        // Janela de silêncio
        const silenced = await isInSilenceWindow(
          supabase,
          alert.studentId,
          policies.silenceWindowDays,
        );
        if (silenced) {
          summary.suppressed++;
          continue;
        }

        // Treinador alvo (com fallback Raquel se inativo / inexistente)
        const { trainerForAlert, escalatedTrainerId, isFallback } = pickTrainer(
          alert.primaryTrainerId,
          policies.fallbackTrainerId,
          trainers,
        );

        const planSnapshot = plansByStudent.get(alert.studentId) ?? null;
        const ackToken = generateAckToken();
        const ackUrl = `${ackBaseUrl}?token=${ackToken}`;

        const msgCtx: AlertMessageContext = {
          studentName: student.full_name,
          planLabel: formatPlanLabel(planSnapshot),
          lastAttendedAt: alert.lastAttendedAt,
          missedDates: alert.missedDates,
          ackUrl,
          alertType: alert.alertType,
        };
        const messageBody = buildTrainerAlertMessage(msgCtx);

        if (body.dryRun) {
          summary.created++;
          continue;
        }

        // Insere primeiro (idempotência via unique partial index)
        const { data: inserted, error: insertErr } = await supabase
          .from("attendance_alerts")
          .insert({
            student_id: alert.studentId,
            trainer_id: alert.primaryTrainerId,
            escalated_to_trainer_id: isFallback ? escalatedTrainerId : null,
            alert_type: alert.alertType,
            missed_session_ids: alert.missedSessionIds,
            missed_booking_ids: alert.missedBookingIds,
            missed_dates: alert.missedDates,
            last_attended_at: alert.lastAttendedAt,
            plan_snapshot: planSnapshot,
            mode: effectiveMode,
            ack_token: ackToken,
            status: isFallback ? "escalated" : "pending",
            escalated_at: isFallback ? new Date().toISOString() : null,
          })
          .select("id")
          .single();

        if (insertErr) {
          // Conflito = já existe alerta aberto pra esse aluno
          if (insertErr.code === "23505") {
            summary.skipped_existing++;
            continue;
          }
          summary.errors.push(`insert ${alert.studentId}: ${insertErr.message}`);
          continue;
        }
        summary.created++;

        // Decide destino do envio
        const targetPhone = resolveTargetPhone({
          mode: effectiveMode,
          shadowPhone: policies.shadowPhone,
          trainer: trainerForAlert,
        });

        if (!inSendWindow) {
          // Alerta criado, envio adiado pra próximo run dentro da janela.
          continue;
        }
        if (!targetPhone) {
          summary.errors.push(
            `no_phone for alert ${inserted.id} (mode=${effectiveMode})`,
          );
          continue;
        }

        const sendResult = await sendWhatsapp(
          supabaseUrl,
          serviceKey,
          targetPhone,
          messageBody,
        );

        await supabase
          .from("attendance_alerts")
          .update({
            notified_at: new Date().toISOString(),
            message_sid: sendResult.sid,
            message_to: targetPhone,
          })
          .eq("id", inserted.id);

        summary.sent++;
      } catch (err) {
        summary.errors.push(
          `alert ${alert.studentId}: ${(err as Error).message ?? String(err)}`,
        );
      }
    }

    return jsonOk(summary);
  } catch (err) {
    console.error("detect-attendance-risk fatal:", err);
    return jsonError(500, (err as Error).message ?? "internal error");
  }
});

// ─────────── Helpers de I/O ───────────

async function loadPolicies(supabase: SupabaseClient): Promise<AgentPolicies> {
  const keys = [
    "attendance_agent.mode",
    "attendance_agent.shadow_phone",
    "attendance_agent.silence_window_days",
    "attendance_agent.escalation_hours",
    "attendance_agent.fallback_trainer_id",
    "attendance_agent.send_window",
    "attendance_agent.timezone",
    "attendance_agent.lookback_days",
  ];
  const { data, error } = await supabase
    .from("policies")
    .select("key, value")
    .in("key", keys);
  if (error) throw new Error(`load policies: ${error.message}`);

  const map = new Map<string, unknown>(
    (data ?? []).map((row) => [row.key as string, row.value]),
  );

  return {
    mode: (map.get("attendance_agent.mode") as "shadow" | "live") ?? "shadow",
    shadowPhone: (map.get("attendance_agent.shadow_phone") as string) ?? "",
    silenceWindowDays:
      (map.get("attendance_agent.silence_window_days") as number) ?? 3,
    escalationHours:
      (map.get("attendance_agent.escalation_hours") as number) ?? 24,
    fallbackTrainerId:
      (map.get("attendance_agent.fallback_trainer_id") as string | null) ?? null,
    sendWindow:
      (map.get("attendance_agent.send_window") as AgentPolicies["sendWindow"]) ?? {
        start_hour: 9,
        end_hour: 19,
        days_of_week: [1, 2, 3, 4, 5],
      },
    timezone:
      (map.get("attendance_agent.timezone") as string) ?? "America/Sao_Paulo",
    lookbackDays: (map.get("attendance_agent.lookback_days") as number) ?? 14,
  };
}

async function loadAttendanceEvents(
  supabase: SupabaseClient,
  lookbackDays: number,
): Promise<Map<string, AttendanceEvent[]>> {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - lookbackDays);
  const startStr = start.toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const map = new Map<string, AttendanceEvent[]>();

  // 1) Personal sessions (1 student per session)
  const { data: personal, error: pErr } = await supabase
    .from("sessions")
    .select(
      "id, session_type, modality, student_id, session_date, start_time, status, trainer_id, assistant_trainer_id, student_checkin_at",
    )
    .eq("session_type", "personal")
    .gte("session_date", startStr)
    .lte("session_date", todayStr)
    .not("student_id", "is", null);
  if (pErr) throw new Error(`load personal: ${pErr.message}`);

  for (const s of personal ?? []) {
    const status = mapSessionStatus(s.status, s.student_checkin_at);
    if (!status) continue;
    pushEvent(map, {
      studentId: s.student_id!,
      sessionId: s.id,
      bookingId: null,
      sessionType: "personal",
      modality: s.modality,
      date: s.session_date,
      startTime: (s.start_time as string).slice(0, 5),
      status,
      trainerId: s.trainer_id ?? null,
      assistantTrainerId: s.assistant_trainer_id ?? null,
    });
  }

  // 2) Group bookings — joinar à session pra pegar data, modality, trainer
  const { data: bookings, error: bErr } = await supabase
    .from("class_bookings")
    .select(
      "id, status, student_id, session:sessions!inner(id, session_date, start_time, modality, status, trainer_id, assistant_trainer_id)",
    )
    .gte("session.session_date", startStr)
    .lte("session.session_date", todayStr);
  if (bErr) throw new Error(`load bookings: ${bErr.message}`);

  type BookingRow = {
    id: string;
    status: string;
    student_id: string;
    session: {
      id: string;
      session_date: string;
      start_time: string;
      modality: string;
      status: string;
      trainer_id: string | null;
      assistant_trainer_id: string | null;
    };
  };

  for (const b of (bookings ?? []) as unknown as BookingRow[]) {
    if (!b.session) continue;
    // Aula cancelada (a sessão inteira) não conta pro aluno.
    if (
      b.session.status === "cancelled_on_time" ||
      b.session.status === "cancelled_late"
    ) {
      continue;
    }
    const status = mapBookingStatus(b.status, b.session.status);
    if (!status) continue;
    pushEvent(map, {
      studentId: b.student_id,
      sessionId: b.session.id,
      bookingId: b.id,
      sessionType: "group",
      modality: b.session.modality,
      date: b.session.session_date,
      startTime: b.session.start_time.slice(0, 5),
      status,
      trainerId: b.session.trainer_id,
      assistantTrainerId: b.session.assistant_trainer_id,
    });
  }

  return map;
}

function pushEvent(
  map: Map<string, AttendanceEvent[]>,
  ev: AttendanceEvent,
): void {
  const list = map.get(ev.studentId);
  if (list) list.push(ev);
  else map.set(ev.studentId, [ev]);
}

function mapSessionStatus(
  status: string,
  checkinAt: string | null,
): AttendanceEvent["status"] | null {
  switch (status) {
    case "completed":
      return "present";
    case "late_arrival":
      return "present";
    case "no_show":
      return "no_show";
    case "cancelled_on_time":
      return "cancelled_on_time";
    case "cancelled_late":
      return "cancelled_late";
    case "scheduled":
      // sessão no passado ainda 'scheduled' = trainer não marcou. Ignora.
      return null;
    default:
      return null;
  }
}

function mapBookingStatus(
  bookingStatus: string,
  sessionStatus: string,
): AttendanceEvent["status"] | null {
  if (bookingStatus === "no_show") return "no_show";
  if (bookingStatus === "confirmed") {
    if (sessionStatus === "completed" || sessionStatus === "late_arrival") {
      return "present";
    }
    return null; // sessão ainda não rolou ou está em estado intermediário
  }
  if (bookingStatus === "cancelled") return "cancelled_on_time";
  return null; // waitlist, etc.
}

async function loadStudents(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, StudentInfo>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("students")
    .select("id, full_name, is_active")
    .in("id", ids);
  if (error) throw new Error(`load students: ${error.message}`);
  return new Map((data ?? []).map((s) => [s.id as string, s as StudentInfo]));
}

async function loadActivePlanByStudent(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, PlanSnapshot>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("contracts")
    .select(
      "student_id, status, plan:plans(name, category, frequency)",
    )
    .in("student_id", ids)
    .eq("status", "active");
  if (error) throw new Error(`load contracts: ${error.message}`);

  const map = new Map<string, PlanSnapshot>();
  for (const row of (data ?? []) as Array<{
    student_id: string;
    plan: { name: string; category: string; frequency: string | null } | null;
  }>) {
    if (!row.plan) continue;
    if (!map.has(row.student_id)) {
      map.set(row.student_id, {
        plan_name: row.plan.name,
        category: row.plan.category,
        frequency: row.plan.frequency,
      });
    }
  }
  return map;
}

async function loadTrainers(
  supabase: SupabaseClient,
): Promise<Map<string, TrainerInfo>> {
  const { data, error } = await supabase
    .from("trainers")
    .select("id, full_name, phone, is_active");
  if (error) throw new Error(`load trainers: ${error.message}`);
  return new Map((data ?? []).map((t) => [t.id as string, t as TrainerInfo]));
}

async function isInSilenceWindow(
  supabase: SupabaseClient,
  studentId: string,
  windowDays: number,
): Promise<boolean> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const { data, error } = await supabase
    .from("attendance_alerts")
    .select("id")
    .eq("student_id", studentId)
    .gt("acknowledged_at", cutoff.toISOString())
    .limit(1);
  if (error) throw new Error(`silence check: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

function pickTrainer(
  primaryId: string | null,
  fallbackId: string | null,
  trainers: Map<string, TrainerInfo>,
): {
  trainerForAlert: TrainerInfo | null;
  escalatedTrainerId: string | null;
  isFallback: boolean;
} {
  const primary = primaryId ? trainers.get(primaryId) ?? null : null;
  if (primary && primary.is_active && primary.phone) {
    return { trainerForAlert: primary, escalatedTrainerId: null, isFallback: false };
  }
  // Fallback Raquel
  const fallback = fallbackId ? trainers.get(fallbackId) ?? null : null;
  return {
    trainerForAlert: fallback,
    escalatedTrainerId: fallback?.id ?? null,
    isFallback: true,
  };
}

function resolveTargetPhone(args: {
  mode: "shadow" | "live";
  shadowPhone: string;
  trainer: TrainerInfo | null;
}): string | null {
  if (args.mode === "shadow") {
    return args.shadowPhone || null;
  }
  return args.trainer?.phone || null;
}

function formatPlanLabel(plan: PlanSnapshot | null): string {
  if (!plan) return "Sem plano ativo";
  if (plan.frequency) return `${plan.plan_name} (${plan.frequency})`;
  return plan.plan_name;
}

async function sendWhatsapp(
  supabaseUrl: string,
  serviceKey: string,
  to: string,
  message: string,
): Promise<{ sid: string | null }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ to, message }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`send-whatsapp ${res.status}: ${text}`);
  }
  const json = (await res.json().catch(() => ({}))) as {
    sid?: string;
    messageSid?: string;
  };
  return { sid: json.sid ?? json.messageSid ?? null };
}

function generateAckToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function nowInTimezone(timezone: string): Date {
  // Constrói um Date que, quando lido com getHours/getDay locais ao runtime,
  // representa o relógio do `timezone` informado.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
