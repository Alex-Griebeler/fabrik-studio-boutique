// Detector de churn / evasão — edge function.
//
// Roda semanalmente (cron `attendance-churn-weekly-mon8h`). Lê o
// histórico de presença de `attendance_events`, roda o helper puro
// `evaluateAllChurn` e PERSISTE os alunos em risco na tabela
// `churn_alerts`.
//
// MVP shadow: NÃO manda WhatsApp. Só detecta e grava — a validação da
// qualidade da detecção é feita olhando a tabela. Envio pros
// treinadores é follow-up depois do histórico amadurecer.
//
// Auth: service_role bearer OU JWT service_role OU cron secret OU
// admin autenticado (pra dry-run manual).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  evaluateAllChurn,
  type ChurnEvaluationOptions,
  type ChurnEvent,
} from "../_shared/attendance/churn.ts";
import { hasValidAttendanceCronSecret } from "../_shared/attendance/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-attendance-agent-cron-secret",
};

function isServiceRoleJwt(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

interface ChurnPolicies {
  mode: "shadow" | "live";
  recentWeeks: number;
  baselineWeeks: number;
  minBaselineWeeks: number;
  dropThresholdPct: number;
  provisionalDropThresholdPct: number;
  lookbackDays: number;
  timezone: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ─── Auth ───
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronAuthorized = await hasValidAttendanceCronSecret(req, supabase);
    let authorized = cronAuthorized;
    if (!authorized && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      authorized = token === serviceKey || isServiceRoleJwt(token);
      if (!authorized) {
        try {
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
          const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: u } = await userClient.auth.getUser();
          if (u?.user) {
            const { data: r } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", u.user.id)
              .eq("role", "admin")
              .maybeSingle();
            if (r) authorized = true;
          }
        } catch {
          /* ignore */
        }
      }
    }
    if (!authorized) return jsonError(401, "Unauthorized");

    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
    };
    const dryRun = !!body.dryRun;

    // ─── Config ───
    const policies = await loadPolicies(supabase);

    // ─── Janela de dados ───
    // `dataEnd` = hoje no fuso do agente. `dataStart` = hoje - lookback.
    // O range REAL de cobertura (min/max event_date) é derivado dos
    // eventos carregados — é ele que alimenta o helper, não a janela de
    // query. Assim, semanas sem nenhum dado não entram como "completas
    // mas vazias" e não enviesam a baseline pra baixo.
    const todayStr = todayInTimezone(policies.timezone);
    const lookbackStart = addDaysStr(todayStr, -policies.lookbackDays);

    const { eventsByStudent, dataStart, dataEnd } = await loadAttendanceEvents(
      supabase,
      lookbackStart,
      todayStr,
    );

    const summary = {
      mode: policies.mode,
      dry_run: dryRun,
      students_evaluated: eventsByStudent.size,
      data_start: dataStart,
      data_end: dataEnd,
      churn_detected: 0,
      churn_full: 0,
      churn_provisional: 0,
      no_risk: 0,
      insufficient: 0,
      created: 0,
      skipped_existing: 0,
      skipped_inactive: 0,
      errors: [] as string[],
    };

    // Sem dados suficientes pra sequer ter um range — devolve cedo.
    if (!dataStart || !dataEnd) {
      return jsonOk({ ...summary, note: "attendance_events vazio na janela" });
    }

    const opts: ChurnEvaluationOptions = {
      dataStart,
      dataEnd,
      recentWeeks: policies.recentWeeks,
      baselineWeeks: policies.baselineWeeks,
      minBaselineWeeks: policies.minBaselineWeeks,
      dropThresholdPct: policies.dropThresholdPct,
      provisionalDropThresholdPct: policies.provisionalDropThresholdPct,
    };

    const results = evaluateAllChurn(eventsByStudent, opts);

    for (const r of results) {
      if (r.confidence === "insufficient") summary.insufficient++;
      else if (r.churnRisk) {
        summary.churn_detected++;
        if (r.confidence === "full") summary.churn_full++;
        else summary.churn_provisional++;
      } else summary.no_risk++;
    }

    const atRisk = results.filter((r) => r.churnRisk);
    if (atRisk.length === 0 || dryRun) {
      return jsonOk(summary);
    }

    // Contexto pra persistir: students ativos + treinador principal.
    const studentIds = atRisk.map((r) => r.studentId);
    const [activeStudents, primaryTrainerByStudent] = await Promise.all([
      loadActiveStudentIds(supabase, studentIds),
      loadPrimaryTrainerByStudent(supabase, studentIds),
    ]);

    for (const r of atRisk) {
      try {
        // Aluno inativo no CRM não vira alerta de churn — já saiu.
        if (!activeStudents.has(r.studentId)) {
          summary.skipped_inactive++;
          continue;
        }

        const { error: insertErr } = await supabase
          .from("churn_alerts")
          .insert({
            student_id: r.studentId,
            trainer_id: primaryTrainerByStudent.get(r.studentId) ?? null,
            confidence: r.confidence,
            recent_weekly_avg: r.recentWeeklyAvg,
            baseline_weekly_avg: r.baselineWeeklyAvg,
            drop_pct: r.dropPct,
            recent_weeks_used: r.recentWeeksUsed,
            baseline_weeks_used: r.baselineWeeksUsed,
            threshold_applied: r.thresholdApplied,
            data_start: dataStart,
            data_end: dataEnd,
            mode: policies.mode,
            status: "open",
          });

        if (insertErr) {
          // 23505 = já existe um churn_alert ABERTO pra esse aluno.
          // Não recria — o alerta aberto se mantém até ack/resolve.
          if (insertErr.code === "23505") {
            summary.skipped_existing++;
            continue;
          }
          summary.errors.push(`insert ${r.studentId}: ${insertErr.message}`);
          continue;
        }
        summary.created++;
      } catch (err) {
        summary.errors.push(
          `alert ${r.studentId}: ${(err as Error).message ?? String(err)}`,
        );
      }
    }

    return jsonOk(summary);
  } catch (err) {
    console.error("detect-churn-risk fatal:", err);
    return jsonError(500, (err as Error).message ?? "internal error");
  }
});

// ─────────── Helpers de I/O ───────────

async function loadPolicies(
  supabase: SupabaseClient,
): Promise<ChurnPolicies> {
  const { data, error } = await supabase
    .from("policies")
    .select("key, value")
    .like("key", "churn_agent.%");
  if (error) throw new Error(`load policies: ${error.message}`);

  const map = new Map<string, unknown>(
    (data ?? []).map((row) => [row.key as string, row.value]),
  );

  return {
    mode: jsonString(map.get("churn_agent.mode")) === "live"
      ? "live"
      : "shadow",
    recentWeeks: jsonInt(map.get("churn_agent.recent_weeks"), 1),
    baselineWeeks: jsonInt(map.get("churn_agent.baseline_weeks"), 8),
    minBaselineWeeks: jsonInt(map.get("churn_agent.min_baseline_weeks"), 4),
    dropThresholdPct: jsonNum(map.get("churn_agent.drop_threshold_pct"), 0.4),
    provisionalDropThresholdPct: jsonNum(
      map.get("churn_agent.provisional_drop_threshold_pct"),
      0.6,
    ),
    lookbackDays: jsonInt(map.get("churn_agent.lookback_days"), 90),
    timezone:
      jsonString(map.get("churn_agent.timezone")) ?? "America/Sao_Paulo",
  };
}

async function loadAttendanceEvents(
  supabase: SupabaseClient,
  startStr: string,
  endStr: string,
): Promise<{
  eventsByStudent: Map<string, ChurnEvent[]>;
  dataStart: string | null;
  dataEnd: string | null;
}> {
  // Só eventos que já aconteceram (exclui `scheduled` — futuro não
  // entra na janela de dados, senão `data_end` vazaria pra frente).
  const { data, error } = await supabase
    .from("attendance_events")
    .select("student_id, event_date, status")
    .gte("event_date", startStr)
    .lte("event_date", endStr)
    .neq("status", "scheduled");
  if (error) throw new Error(`load attendance_events: ${error.message}`);

  const eventsByStudent = new Map<string, ChurnEvent[]>();
  let dataStart: string | null = null;
  let dataEnd: string | null = null;

  for (const row of (data ?? []) as Array<{
    student_id: string;
    event_date: string;
    status: string;
  }>) {
    const date = row.event_date;
    if (dataStart === null || date < dataStart) dataStart = date;
    if (dataEnd === null || date > dataEnd) dataEnd = date;

    const ev: ChurnEvent = {
      occurredDate: date,
      isPresence: row.status === "present",
    };
    const list = eventsByStudent.get(row.student_id);
    if (list) list.push(ev);
    else eventsByStudent.set(row.student_id, [ev]);
  }

  return { eventsByStudent, dataStart, dataEnd };
}

async function loadActiveStudentIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from("students")
    .select("id, is_active")
    .in("id", ids);
  if (error) throw new Error(`load students: ${error.message}`);
  return new Set(
    (data ?? [])
      .filter((s) => (s as { is_active: boolean }).is_active)
      .map((s) => (s as { id: string }).id),
  );
}

/**
 * Treinador "principal" de cada aluno = treinador do evento de presença
 * mais recente dentro da janela. Inferência best-effort pra roteamento
 * futuro do alerta; null quando não dá pra inferir.
 */
async function loadPrimaryTrainerByStudent(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from("attendance_events")
    .select("student_id, trainer_id, event_date")
    .in("student_id", ids)
    .eq("status", "present")
    .not("trainer_id", "is", null)
    .order("event_date", { ascending: false });
  if (error) throw new Error(`load primary trainers: ${error.message}`);

  for (const row of (data ?? []) as Array<{
    student_id: string;
    trainer_id: string | null;
  }>) {
    // Linhas vêm da mais recente pra mais antiga — primeira ocorrência
    // por aluno é o treinador mais recente.
    if (row.trainer_id && !out.has(row.student_id)) {
      out.set(row.student_id, row.trainer_id);
    }
  }
  return out;
}

// ─────────── Parsing de jsonb ───────────

function jsonString(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim().length > 0) return raw;
  return null;
}

function jsonNum(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return fallback;
}

function jsonInt(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  return fallback;
}

// ─────────── Datas ───────────

function todayInTimezone(timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA formata como yyyy-mm-dd.
  return fmt.format(new Date());
}

function addDaysStr(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─────────── Respostas ───────────

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
