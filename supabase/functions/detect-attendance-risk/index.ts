import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  evaluateAll,
  isHistoricalDuplicate,
  isWithinSendWindow,
  type AttendanceEvent,
  type AlertType,
  type RiskAlert,
} from "../_shared/attendance/detection.ts";
import { newAlertInitialState } from "../_shared/attendance/escalation.ts";
import { hasValidAttendanceCronSecret } from "../_shared/attendance/cronAuth.ts";
import {
  buildTrainerAlertBody,
  currentWhatsappProvider,
  type TrainerAlertData,
  type WhatsappSendBody,
} from "../_shared/whatsapp/attendanceTemplates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Aceita JWT do gateway com role=service_role (novo sistema sb_secret_*)
function isServiceRoleJwt(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.role === "service_role";
  } catch { return false; }
}

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

interface PendingAlertRow {
  id: string;
  trainer_id: string | null;
  escalated_to_trainer_id: string | null;
  alert_type: RiskAlert["alertType"];
  missed_dates: string[];
  last_attended_at: string | null;
  plan_snapshot: PlanSnapshot | null;
  status: "pending" | "escalated";
  mode: "shadow" | "live";
  ack_token: string;
  student: { full_name: string } | null;
  trainer: TrainerInfo | null;
  escalated_to_trainer: TrainerInfo | null;
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

    // Auth: aceita service_role bearer, segredo interno do cron OU usuário admin (testes)
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronAuthorized = await hasValidAttendanceCronSecret(req, supabase);
    if (!authHeader.startsWith("Bearer ") && !cronAuthorized) {
      return jsonError(401, "Missing Authorization");
    }
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : "";
    let payloadDbg: unknown = null;
    try {
      payloadDbg = JSON.parse(
        atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
    } catch {
      payloadDbg = null;
    }
    console.log("[detect-auth] tokenLen:", token.length, "payload:", JSON.stringify(payloadDbg));
    let isServiceRole =
      token === serviceKey ||
      isServiceRoleJwt(token) ||
      cronAuthorized;
    if (!isServiceRole && authHeader.startsWith("Bearer ")) {
      // Permite admin autenticado pra dry-run/testes manuais
      try {
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
        const { data: u } = await userClient.auth.getUser();
        if (u?.user) {
          const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
          if (r) isServiceRole = true;
        }
      } catch { /* ignore */ }
    }
    if (!isServiceRole) {
      return jsonError(403, "Service-role required");
    }

    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      forceMode?: "shadow" | "live";
    };

    const policies = await loadPolicies(supabase);
    const effectiveMode = body.forceMode ?? policies.mode;

    // Provider de WhatsApp pra essa rodada inteira. Default `twilio`
    // (zero diff vs comportamento atual em produção). Lê uma vez aqui
    // pra coerência entre o ping principal e o `sendPendingAlerts`.
    const provider = currentWhatsappProvider(
      Deno.env.get("WHATSAPP_PROVIDER") ?? undefined,
    );

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
      unnotified_candidates: 0,
      unnotified_sent: 0,
      created: 0,
      suppressed: 0,
      sent: 0,
      skipped_existing: 0,
      skipped_no_contract: 0,
      skipped_duplicate_history: 0,
      errors: [] as string[],
    };

    if (!body.dryRun && inSendWindow) {
      try {
        const pending = await sendPendingAlerts({
          supabase,
          supabaseUrl,
          serviceKey,
          policies,
          provider,
        });
        summary.unnotified_candidates = pending.candidates;
        summary.unnotified_sent = pending.sent;
        summary.errors.push(...pending.errors);
      } catch (err) {
        summary.errors.push(
          `pending send: ${(err as Error).message ?? String(err)}`,
        );
      }
    }

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

        // Fix #1: aluno sem contrato ativo no CRM NÃO gera alerta.
        // Antes a mensagem dizia "Sem plano ativo" e ainda assim
        // disparava — caso real (Christina Aires): mapping EVO OK mas
        // sem contrato no CRM. Pulamos sem criar alerta nem registro
        // de erro; só contador no summary pra observabilidade.
        const planSnapshot = plansByStudent.get(alert.studentId) ?? null;
        if (!planSnapshot) {
          summary.skipped_no_contract++;
          continue;
        }

        // Fix #3: dedup por assinatura histórica. Se já houve alerta
        // (em qualquer status) com mesmo alert_type + mesma multiset
        // de missed_dates pra esse aluno, NÃO recria.
        //
        // Trava explícita: critério é igualdade exata da multiset, NÃO
        // overlap parcial. Alerta novo {05,07,09} vs histórico {05,07}
        // são considerados diferentes (o novo agrega uma data) — só
        // bloqueia recriar idêntico.
        const history = await loadAlertHistory(supabase, alert.studentId);
        if (
          isHistoricalDuplicate(
            { alertType: alert.alertType, missedDates: alert.missedDates },
            history,
          )
        ) {
          summary.skipped_duplicate_history++;
          continue;
        }

        // Treinador alvo (com fallback Raquel se inativo / inexistente)
        const { trainerForAlert, escalatedTrainerId, isFallback } = pickTrainer(
          alert.primaryTrainerId,
          policies.fallbackTrainerId,
          trainers,
        );

        const ackToken = generateAckToken();
        const ackUrl = `${ackBaseUrl}?token=${ackToken}`;

        if (body.dryRun) {
          summary.created++;
          continue;
        }

        // Insere primeiro (idempotência via unique partial index).
        // Regra: alerta novo SEMPRE nasce `pending` com escalated_at=null.
        // `escalated_to_trainer_id` aqui é apenas o destino de roteamento
        // quando o titular não tem telefone — a escalação real (mudança
        // de status) é responsabilidade exclusiva da function
        // `escalate-attendance-alerts` após `escalation_hours` sem ack.
        const initialState = newAlertInitialState();
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
            status: initialState.status,
            escalated_at: initialState.escalated_at,
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

        const trainerAlertData: TrainerAlertData = {
          to: targetPhone,
          ackToken,
          ackUrl,
          studentName: student.full_name,
          planLabel: formatPlanLabel(planSnapshot),
          lastAttendedAt: alert.lastAttendedAt,
          missedDates: alert.missedDates,
          alertType: alert.alertType,
        };
        const sendBody = buildTrainerAlertBody(trainerAlertData, provider);

        const sendResult = await sendWhatsapp(
          supabaseUrl,
          serviceKey,
          sendBody,
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

async function sendPendingAlerts(args: {
  supabase: SupabaseClient;
  supabaseUrl: string;
  serviceKey: string;
  policies: AgentPolicies;
  provider: "twilio" | "meta";
}): Promise<{ candidates: number; sent: number; errors: string[] }> {
  const { supabase, supabaseUrl, serviceKey, policies, provider } = args;
  const { data, error } = await supabase
    .from("attendance_alerts")
    .select(
      "id, trainer_id, escalated_to_trainer_id, alert_type, missed_dates, last_attended_at, plan_snapshot, status, mode, ack_token, student:students!attendance_alerts_student_id_fkey(full_name), trainer:trainers!attendance_alerts_trainer_id_fkey(id, full_name, phone, is_active), escalated_to_trainer:trainers!attendance_alerts_escalated_to_trainer_id_fkey(id, full_name, phone, is_active)",
    )
    .in("status", ["pending", "escalated"])
    .is("notified_at", null)
    .order("detected_at", { ascending: true })
    .limit(100);

  if (error) throw new Error(`load pending alerts: ${error.message}`);

  const rows = (data ?? []) as unknown as PendingAlertRow[];
  const summary = {
    candidates: rows.length,
    sent: 0,
    errors: [] as string[],
  };

  if (rows.length === 0) return summary;

  const ackBaseUrl = `${supabaseUrl}/functions/v1/acknowledge-attendance-alert`;

  for (const row of rows) {
    try {
      const trainerForAlert = row.escalated_to_trainer ?? row.trainer;
      const targetPhone = resolveTargetPhone({
        mode: row.mode,
        shadowPhone: policies.shadowPhone,
        trainer: trainerForAlert?.is_active ? trainerForAlert : null,
      });

      if (!targetPhone) {
        summary.errors.push(
          `pending ${row.id}: no target phone (status=${row.status}, mode=${row.mode})`,
        );
        continue;
      }

      const ackUrl = `${ackBaseUrl}?token=${row.ack_token}`;
      const trainerAlertData: TrainerAlertData = {
        to: targetPhone,
        ackToken: row.ack_token,
        ackUrl,
        studentName: row.student?.full_name ?? "Aluno",
        planLabel: formatPlanLabel(row.plan_snapshot),
        lastAttendedAt: row.last_attended_at,
        missedDates: row.missed_dates,
        alertType: row.alert_type,
      };
      const sendBody = buildTrainerAlertBody(trainerAlertData, provider);

      const sendResult = await sendWhatsapp(
        supabaseUrl,
        serviceKey,
        sendBody,
      );

      const { error: updateErr } = await supabase
        .from("attendance_alerts")
        .update({
          notified_at: new Date().toISOString(),
          message_sid: sendResult.sid,
          message_to: targetPhone,
        })
        .eq("id", row.id)
        .is("notified_at", null);

      if (updateErr) {
        summary.errors.push(`pending ${row.id}: update ${updateErr.message}`);
        continue;
      }

      summary.sent++;
    } catch (err) {
      summary.errors.push(`pending ${row.id}: ${(err as Error).message}`);
    }
  }

  return summary;
}

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

  // Lê da fonte normalizada (`attendance_events`). Pode conter eventos
  // de qualquer source (`evo`, `internal_session`, `manual`) — a lógica
  // de detecção é agnóstica de origem.
  //
  // IMPORTANTE: usa `id` (uuid de attendance_events), não `source_id`.
  // `attendance_alerts.missed_session_ids` é uuid[] e source_id é texto
  // arbitrário (ex.: `"17535:4321"` pra eventos EVO).
  const { data, error } = await supabase
    .from("attendance_events")
    .select(
      "id, student_id, trainer_id, assistant_trainer_id, event_date, start_time, modality, session_type, status",
    )
    .gte("event_date", startStr)
    .lte("event_date", todayStr);
  if (error) throw new Error(`load attendance_events: ${error.message}`);

  type Row = {
    id: string;
    student_id: string;
    trainer_id: string | null;
    assistant_trainer_id: string | null;
    event_date: string;
    start_time: string;
    modality: string;
    session_type: "personal" | "group";
    status: AttendanceEvent["status"];
  };

  for (const ev of (data ?? []) as Row[]) {
    pushEvent(map, {
      studentId: ev.student_id,
      sessionId: ev.id,
      bookingId: null,
      sessionType: ev.session_type,
      modality: ev.modality,
      date: ev.event_date,
      startTime: ev.start_time.slice(0, 5),
      status: ev.status,
      trainerId: ev.trainer_id,
      assistantTrainerId: ev.assistant_trainer_id,
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

/**
 * Carrega o histórico completo de alertas do aluno (qualquer status)
 * pra checagem de duplicata por assinatura. Volume típico por aluno é
 * baixo (<10 entradas), uma query simples não pesa. Caller passa pro
 * helper puro `isHistoricalDuplicate`.
 */
async function loadAlertHistory(
  supabase: SupabaseClient,
  studentId: string,
): Promise<Array<{ alert_type: AlertType; missed_dates: string[] }>> {
  const { data, error } = await supabase
    .from("attendance_alerts")
    .select("alert_type, missed_dates")
    .eq("student_id", studentId);
  if (error) throw new Error(`load alert history: ${error.message}`);
  return ((data ?? []) as Array<{
    alert_type: AlertType;
    missed_dates: string[] | null;
  }>).map((r) => ({
    alert_type: r.alert_type,
    missed_dates: r.missed_dates ?? [],
  }));
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

/**
 * Chama `send-whatsapp` passando o body completo já moldado pelo
 * provider escolhido (Twilio `{to,message}` ou Meta
 * `{to,template:{...}}`). `send-whatsapp` despacha pro adapter certo.
 */
async function sendWhatsapp(
  supabaseUrl: string,
  serviceKey: string,
  body: WhatsappSendBody,
): Promise<{ sid: string | null }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
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
