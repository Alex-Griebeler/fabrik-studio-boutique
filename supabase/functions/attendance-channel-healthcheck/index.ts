// Healthcheck do canal WhatsApp do agente de faltas.
//
// Fluxo (1 cron diário 7h SP, seg-sex):
//   1. Lê `attendance_agent.shadow_phone` do `policies`.
//   2. Envia 1 mensagem WhatsApp teste curta via `send-whatsapp`.
//   3. Aguarda 15s.
//   4. Consulta status do SID na Twilio Messages API.
//   5. Classifica via `classifyHealthcheckResult`:
//        ok       → reset contador, atualiza last_ok_at
//        failed   → incrementa contador
//        pending  → contador inalterado
//   6. Se `consecutiveFailures >= threshold`, manda WhatsApp de
//      AVISO pro mesmo `shadow_phone` ("canal pode estar quebrado").
//      Trade-off conhecido: se canal está realmente down, o aviso
//      também não chega — mas registramos em runtime_config + log.
//
// Auth: service_role bearer (cron interno) OU cron secret via
// header `x-attendance-agent-cron-secret`.
//
// NÃO toca em alertas, mode, fallback, telefones ou outros policies.
// NÃO chama detector/escalator/sync.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasValidAttendanceCronSecret } from "../_shared/attendance/cronAuth.ts";
import {
  classifyHealthcheckResult,
  decideAlertEscalation,
  nextConsecutiveFailures,
  parseConfigInt,
  type HealthcheckOutcome,
} from "../_shared/attendance/healthcheck.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-attendance-agent-cron-secret",
};

const STATUS_CHECK_DELAY_MS = 15_000;
const MESSAGE_BODY = (now: string) =>
  `🔧 Healthcheck do agente de faltas (${now}). Mensagem automatizada — pode ignorar.`;

interface HealthcheckSummary {
  outcome: HealthcheckOutcome;
  twilio_status: string | null;
  twilio_error_code: string | null;
  consecutive_failures: number;
  threshold: number;
  alerted_operator: boolean;
  shadow_phone_present: boolean;
  message_sid: string | null;
  errors: string[];
}

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

    // Auth: service_role bearer OU cron secret
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronAuthorized = await hasValidAttendanceCronSecret(req, supabase);
    if (!authHeader.startsWith("Bearer ")) {
      if (!cronAuthorized) return jsonError(401, "Missing Authorization or cron secret");
    } else {
      const token = authHeader.replace("Bearer ", "");
      if (token !== serviceKey && !isServiceRoleJwt(token) && !cronAuthorized) {
        return jsonError(403, "Service-role required");
      }
    }

    // Twilio creds (pra GET status)
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!accountSid || !authToken) {
      return jsonError(500, "Twilio env not configured");
    }
    const twilioAuth = "Basic " + btoa(`${accountSid}:${authToken}`);

    // Lê shadow_phone
    const shadowPhone = await loadShadowPhone(supabase);
    if (!shadowPhone) {
      return jsonOk({
        outcome: "pending",
        twilio_status: null,
        twilio_error_code: null,
        consecutive_failures: 0,
        threshold: 0,
        alerted_operator: false,
        shadow_phone_present: false,
        message_sid: null,
        errors: ["shadow_phone not configured in policies"],
      } satisfies HealthcheckSummary);
    }

    // Lê config (threshold, contador atual)
    const config = await loadHealthcheckConfig(supabase);

    const summary: HealthcheckSummary = {
      outcome: "pending",
      twilio_status: null,
      twilio_error_code: null,
      consecutive_failures: config.consecutiveFailures,
      threshold: config.threshold,
      alerted_operator: false,
      shadow_phone_present: true,
      message_sid: null,
      errors: [],
    };

    // 1) Envia mensagem teste via send-whatsapp
    let sid: string | null = null;
    try {
      const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          to: shadowPhone,
          message: MESSAGE_BODY(new Date().toISOString()),
        }),
      });
      if (!sendRes.ok) {
        const text = await sendRes.text();
        summary.errors.push(`send-whatsapp ${sendRes.status}: ${text.slice(0, 140)}`);
      } else {
        const json = (await sendRes.json().catch(() => ({}))) as {
          sid?: string;
          messageSid?: string;
        };
        sid = json.sid ?? json.messageSid ?? null;
        summary.message_sid = sid;
      }
    } catch (err) {
      summary.errors.push(`send-whatsapp call: ${(err as Error).message ?? String(err)}`);
    }

    // 2) Aguarda Twilio processar (15s) e consulta status
    if (sid) {
      await sleep(STATUS_CHECK_DELAY_MS);
      try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages/${encodeURIComponent(sid)}.json`;
        const res = await fetch(url, {
          method: "GET",
          headers: { Authorization: twilioAuth, Accept: "application/json" },
        });
        if (res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            status?: string;
            error_code?: string | number | null;
            error_message?: string | null;
          };
          summary.twilio_status = payload.status ?? null;
          summary.twilio_error_code =
            payload.error_code != null ? String(payload.error_code) : null;
          summary.outcome = classifyHealthcheckResult(summary.twilio_status);
        } else {
          const text = await res.text();
          summary.errors.push(`twilio ${res.status}: ${text.slice(0, 140)}`);
        }
      } catch (err) {
        summary.errors.push(
          `twilio status fetch: ${(err as Error).message ?? String(err)}`,
        );
      }
    }

    // 3) Atualiza contador e estado em runtime_config
    const newConsecutive = nextConsecutiveFailures({
      current: config.consecutiveFailures,
      outcome: summary.outcome,
    });
    summary.consecutive_failures = newConsecutive;

    const lastError =
      summary.outcome === "failed"
        ? `${summary.twilio_error_code ?? ""}|${summary.twilio_status ?? ""}`.slice(0, 200)
        : "";

    await persistHealthcheckState(supabase, {
      consecutiveFailures: newConsecutive,
      lastSid: sid,
      lastStatus: summary.outcome,
      lastError,
      lastOkAt: summary.outcome === "ok" ? new Date().toISOString() : null,
    });

    // 4) Decide se manda alerta de canal quebrado pro operador
    const decision = decideAlertEscalation({
      consecutiveFailures: newConsecutive,
      threshold: config.threshold,
    });

    if (decision.shouldAlert) {
      try {
        const alertBody =
          `⚠️ Canal WhatsApp do agente de faltas falhou ${newConsecutive}x consecutivas.\n\n` +
          `Último status Twilio: ${summary.twilio_status ?? "n/d"}\n` +
          `Último erro: ${summary.twilio_error_code ?? "n/d"}\n\n` +
          `Verifique o sandbox Twilio (join), ou se shadow_phone está alinhado com o número joined.`;

        const alertRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ to: shadowPhone, message: alertBody }),
        });
        // Trade-off conhecido: se canal está down, este alerta também
        // não vai chegar. Mas registramos no log e no runtime_config.
        if (!alertRes.ok) {
          summary.errors.push(
            `operator-alert send failed: ${alertRes.status} (canal pode estar mesmo down)`,
          );
        } else {
          summary.alerted_operator = true;
        }
      } catch (err) {
        summary.errors.push(
          `operator-alert: ${(err as Error).message ?? String(err)}`,
        );
      }

      // Registra crítico no log mesmo se Twilio falhar
      console.error(
        "[attendance-channel-healthcheck] CHANNEL DOWN — consecutive failures:",
        newConsecutive,
        "threshold:",
        config.threshold,
        "twilio_status:",
        summary.twilio_status,
        "twilio_error_code:",
        summary.twilio_error_code,
      );
    }

    return jsonOk(summary);
  } catch (err) {
    console.error("attendance-channel-healthcheck fatal:", err);
    return jsonError(500, (err as Error).message ?? "internal error");
  }
});

// ─────────── Helpers ───────────

async function loadShadowPhone(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from("policies")
    .select("value")
    .eq("key", "attendance_agent.shadow_phone")
    .maybeSingle();
  if (error) {
    console.warn("load shadow_phone:", error.message);
    return null;
  }
  const raw = data?.value as unknown;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return null;
}

async function loadHealthcheckConfig(
  supabase: SupabaseClient,
): Promise<{ threshold: number; consecutiveFailures: number }> {
  const { data, error } = await supabase
    .from("attendance_agent_runtime_config")
    .select("key, value")
    .in("key", ["healthcheck_threshold", "healthcheck_consecutive_failures"]);
  if (error) {
    console.warn("load healthcheck config:", error.message);
    return { threshold: 2, consecutiveFailures: 0 };
  }
  const map = new Map<string, string>(
    (data ?? []).map((r) => [r.key as string, r.value as string]),
  );
  return {
    threshold: parseConfigInt(map.get("healthcheck_threshold"), 2),
    consecutiveFailures: parseConfigInt(
      map.get("healthcheck_consecutive_failures"),
      0,
    ),
  };
}

async function persistHealthcheckState(
  supabase: SupabaseClient,
  args: {
    consecutiveFailures: number;
    lastSid: string | null;
    lastStatus: HealthcheckOutcome;
    lastError: string;
    lastOkAt: string | null;
  },
): Promise<void> {
  const updates: Array<{ key: string; value: string }> = [
    {
      key: "healthcheck_consecutive_failures",
      value: String(args.consecutiveFailures),
    },
    { key: "healthcheck_last_status", value: args.lastStatus },
    { key: "healthcheck_last_error", value: args.lastError },
    { key: "healthcheck_last_sid", value: args.lastSid ?? "" },
  ];
  if (args.lastOkAt) {
    updates.push({ key: "healthcheck_last_ok_at", value: args.lastOkAt });
  }

  for (const u of updates) {
    const { error } = await supabase
      .from("attendance_agent_runtime_config")
      .update({ value: u.value, updated_at: new Date().toISOString() })
      .eq("key", u.key);
    if (error) {
      console.warn(`update ${u.key}:`, error.message);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
