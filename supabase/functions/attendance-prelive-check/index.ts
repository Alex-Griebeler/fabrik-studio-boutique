// Validador pré-live do agente de faltas.
//
// Coleta o estado atual (policies, runtime_config, trainers, crons) e
// roda `evaluatePreLiveChecks` — devolve um relatório GO/NO-GO com a
// lista de blockers e warnings. Útil pra rodar ANTES de virar
// `attendance_agent.mode = 'live'`.
//
// READ-ONLY: não altera nada. Não vira live, não manda WhatsApp, não
// chama detector/sync/escalator. Só lê e reporta.
//
// Auth: service_role bearer OU cron secret OU admin autenticado.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasValidAttendanceCronSecret } from "../_shared/attendance/cronAuth.ts";
import {
  evaluatePreLiveChecks,
  type PreLiveSendWindow,
  type PreLiveTrainer,
} from "../_shared/attendance/prelive.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-attendance-agent-cron-secret",
};

const EXPECTED_CRONS = [
  "attendance-detect-22h",
  "attendance-send-pending-9h",
  "attendance-escalate-30min",
  "attendance-evo-sync-21h40",
  "attendance-channel-healthcheck-7h-sp",
];

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: service_role bearer OU JWT service_role OU cron secret OU admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronAuthorized = await hasValidAttendanceCronSecret(req, supabase);
    let authorized = cronAuthorized;
    if (!authorized && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      authorized = token === serviceKey || isServiceRoleJwt(token);
      if (!authorized) {
        // admin autenticado
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

    // ─── Coleta de estado ───
    const errors: string[] = [];

    // 1) Policies do agente
    const { data: policyRows, error: pErr } = await supabase
      .from("policies")
      .select("key, value")
      .like("key", "attendance_agent.%");
    if (pErr) errors.push(`policies: ${pErr.message}`);
    const policies = new Map<string, unknown>(
      (policyRows ?? []).map((r) => [r.key as string, r.value]),
    );

    const mode = jsonbString(policies.get("attendance_agent.mode"));
    const shadowPhone = jsonbString(
      policies.get("attendance_agent.shadow_phone"),
    );
    const fallbackTrainerId = jsonbString(
      policies.get("attendance_agent.fallback_trainer_id"),
    );
    const sendWindow = parseSendWindow(
      policies.get("attendance_agent.send_window"),
    );

    // 2) runtime_config
    const { data: rcRows, error: rcErr } = await supabase
      .from("attendance_agent_runtime_config")
      .select("key, value")
      .in("key", [
        "cron_secret",
        "healthcheck_last_status",
        "healthcheck_last_ok_at",
        "healthcheck_consecutive_failures",
      ]);
    if (rcErr) errors.push(`runtime_config: ${rcErr.message}`);
    const rc = new Map<string, string>(
      (rcRows ?? []).map((r) => [r.key as string, r.value as string]),
    );
    const cronSecretPresent = (rc.get("cron_secret") ?? "").length > 0;
    const healthcheckLastStatus = rc.get("healthcheck_last_status") ?? null;
    const healthcheckLastOkAt = rc.get("healthcheck_last_ok_at") || null;
    const healthcheckConsecutiveFailures = parseInt(
      rc.get("healthcheck_consecutive_failures") ?? "0",
      10,
    );

    // 3) Trainers ativos + fallback trainer
    const { data: trainerRows, error: tErr } = await supabase
      .from("trainers")
      .select("id, full_name, phone, is_active");
    if (tErr) errors.push(`trainers: ${tErr.message}`);
    const allTrainers = (trainerRows ?? []) as Array<{
      id: string;
      full_name: string;
      phone: string | null;
      is_active: boolean;
    }>;
    const activeTrainers: PreLiveTrainer[] = allTrainers
      .filter((t) => t.is_active)
      .map((t) => ({ id: t.id, full_name: t.full_name, phone: t.phone }));

    let fallbackTrainer: PreLiveTrainer | null = null;
    let fallbackTrainerActive: boolean | null = null;
    if (fallbackTrainerId) {
      const found = allTrainers.find((t) => t.id === fallbackTrainerId);
      if (found) {
        fallbackTrainer = {
          id: found.id,
          full_name: found.full_name,
          phone: found.phone,
        };
        fallbackTrainerActive = found.is_active;
      }
    }

    // 4) Crons agendados (via função SQL — cron.job não é exposto via PostgREST)
    const { data: cronRows, error: cErr } = await supabase.rpc(
      "attendance_cron_jobnames",
    );
    if (cErr) errors.push(`crons: ${cErr.message}`);
    const presentCrons = ((cronRows ?? []) as Array<{
      jobname: string;
      active: boolean;
    }>)
      .filter((c) => c.active)
      .map((c) => c.jobname);

    // ─── Avaliação ───
    // Se alguma query de coleta falhou, o estado pode estar parcial —
    // o helper devolve INDETERMINATE em vez de um NO-GO enganoso.
    const report = evaluatePreLiveChecks({
      mode,
      shadowPhone,
      fallbackTrainerId,
      fallbackTrainer,
      fallbackTrainerActive,
      cronSecretPresent,
      sendWindow,
      healthcheckLastStatus,
      healthcheckLastOkAt,
      healthcheckConsecutiveFailures: Number.isFinite(
        healthcheckConsecutiveFailures,
      )
        ? healthcheckConsecutiveFailures
        : 0,
      activeTrainers,
      expectedCrons: EXPECTED_CRONS,
      presentCrons,
      now: new Date(),
      collectionFailed: errors.length > 0,
    });

    return jsonOk({
      decision: report.decision,
      current_mode: mode,
      blockers: report.blockers,
      warnings: report.warnings,
      checks: report.checks,
      collection_errors: errors,
    });
  } catch (err) {
    console.error("attendance-prelive-check fatal:", err);
    return jsonError(500, (err as Error).message ?? "internal error");
  }
});

/**
 * Extrai string de um valor jsonb de `policies.value`. jsonb string
 * deserializa pra string JS; qualquer outra coisa (null, objeto,
 * número) vira null. Substitui o `as string` que mentia pro TS.
 */
function jsonbString(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim().length > 0) return raw;
  return null;
}

/**
 * Valida o shape de `attendance_agent.send_window` vindo do jsonb.
 * Retorna null se malformado — o helper `isValidSendWindow` ainda
 * revalida, mas aqui já garantimos que o tipo não é uma mentira.
 */
function parseSendWindow(raw: unknown): PreLiveSendWindow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.start_hour !== "number" ||
    typeof o.end_hour !== "number" ||
    !Array.isArray(o.days_of_week)
  ) {
    return null;
  }
  if (!o.days_of_week.every((d) => typeof d === "number")) return null;
  return {
    start_hour: o.start_hour,
    end_hour: o.end_hour,
    days_of_week: o.days_of_week as number[],
  };
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
