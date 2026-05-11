// Edge function que consulta a Twilio pelo status de entrega das
// mensagens já enviadas pelo agente de faltas e atualiza colunas
// `*_provider_*` em `attendance_alerts`. Read-only do ponto de vista
// da Twilio (GET /Messages/{sid}.json). Não envia mensagem nova,
// não cria/escala/resolve alerta.
//
// Body opcional:
//   { dryRun?: boolean, alertId?: string, limit?: number }
//
// Default dryRun=true. Em dry-run, devolve o que atualizaria sem
// gravar. Em dryRun=false, faz UPDATE apenas das 8 colunas novas
// (`message_provider_*` / `escalation_provider_*`). Nenhum outro
// campo é tocado.
//
// Auth: service_role bearer (cron interno) OU admin autenticado
// (mesmo padrão das outras attendance functions).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeTwilioMessageStatus } from "../_shared/attendance/twilio-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface RefreshBody {
  dryRun?: boolean;
  alertId?: string;
  limit?: number;
}

interface AlertRow {
  id: string;
  message_sid: string | null;
  escalation_message_sid: string | null;
}

type RefreshKind = "message" | "escalation";

interface RefreshResult {
  alert_id: string;
  kind: RefreshKind;
  sid: string;
  provider_status: string | null;
  provider_error_code: string | null;
  provider_error_message: string | null;
  would_update: boolean;
}

interface RefreshSummary {
  dry_run: boolean;
  checked: number;
  updated: number;
  results: RefreshResult[];
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

    // Auth: aceita service_role bearer (cron / admin curl) OU JWT
    // com role=service_role OU usuário admin autenticado.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError(401, "Missing Authorization");
    }
    const token = authHeader.replace("Bearer ", "");
    let authorized = token === serviceKey || isServiceRoleJwt(token);
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
    if (!authorized) return jsonError(403, "Service-role or admin required");

    const body = ((await req.json().catch(() => ({}))) ?? {}) as RefreshBody;
    const dryRun = body.dryRun !== undefined ? !!body.dryRun : true;
    const limit = clamp(body.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);

    // Twilio env
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!accountSid || !authToken) {
      return jsonError(500, "Twilio env not configured");
    }
    const twilioAuth = "Basic " + btoa(`${accountSid}:${authToken}`);

    // Carrega alertas alvo
    const alerts = await loadAlerts(supabase, body.alertId, limit);

    const summary: RefreshSummary = {
      dry_run: dryRun,
      checked: 0,
      updated: 0,
      results: [],
      errors: [],
    };

    for (const row of alerts) {
      // 1) Mensagem principal (treinador)
      if (row.message_sid) {
        const r = await refreshOne({
          supabase,
          accountSid,
          twilioAuth,
          alertId: row.id,
          kind: "message",
          sid: row.message_sid,
          dryRun,
          summary,
        });
        if (r) summary.results.push(r);
      }
      // 2) Mensagem de escalação (Raquel)
      if (row.escalation_message_sid) {
        const r = await refreshOne({
          supabase,
          accountSid,
          twilioAuth,
          alertId: row.id,
          kind: "escalation",
          sid: row.escalation_message_sid,
          dryRun,
          summary,
        });
        if (r) summary.results.push(r);
      }
    }

    return jsonOk(summary);
  } catch (err) {
    console.error("refresh-attendance-message-status fatal:", err);
    return jsonError(500, (err as Error).message ?? "internal error");
  }
});

async function loadAlerts(
  supabase: SupabaseClient,
  alertId: string | undefined,
  limit: number,
): Promise<AlertRow[]> {
  if (alertId) {
    const { data, error } = await supabase
      .from("attendance_alerts")
      .select("id, message_sid, escalation_message_sid")
      .eq("id", alertId)
      .maybeSingle();
    if (error) throw new Error(`load alert ${alertId}: ${error.message}`);
    if (!data) return [];
    return [data as AlertRow];
  }
  const { data, error } = await supabase
    .from("attendance_alerts")
    .select("id, message_sid, escalation_message_sid")
    .or("message_sid.not.is.null,escalation_message_sid.not.is.null")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`load alerts: ${error.message}`);
  return (data ?? []) as AlertRow[];
}

interface RefreshArgs {
  supabase: SupabaseClient;
  accountSid: string;
  twilioAuth: string;
  alertId: string;
  kind: RefreshKind;
  sid: string;
  dryRun: boolean;
  summary: RefreshSummary;
}

async function refreshOne(args: RefreshArgs): Promise<RefreshResult | null> {
  const { supabase, accountSid, twilioAuth, alertId, kind, sid, dryRun, summary } = args;
  summary.checked++;

  let payload: unknown;
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages/${encodeURIComponent(sid)}.json`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: twilioAuth,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await safeText(res);
      summary.errors.push(
        `alert ${alertId} (${kind}) sid ${sid}: twilio ${res.status} ${text.slice(0, 140)}`,
      );
      return null;
    }
    payload = await res.json();
  } catch (err) {
    summary.errors.push(
      `alert ${alertId} (${kind}) sid ${sid}: ${(err as Error).message ?? String(err)}`,
    );
    return null;
  }

  const normalized = normalizeTwilioMessageStatus(payload);

  if (!dryRun) {
    const checkedAt = new Date().toISOString();
    const patch =
      kind === "message"
        ? {
            message_provider_status: normalized.status,
            message_provider_error_code: normalized.errorCode,
            message_provider_error_message: normalized.errorMessage,
            message_provider_checked_at: checkedAt,
          }
        : {
            escalation_provider_status: normalized.status,
            escalation_provider_error_code: normalized.errorCode,
            escalation_provider_error_message: normalized.errorMessage,
            escalation_provider_checked_at: checkedAt,
          };

    const { error: upErr } = await supabase
      .from("attendance_alerts")
      .update(patch)
      .eq("id", alertId);
    if (upErr) {
      summary.errors.push(`update ${alertId} (${kind}): ${upErr.message}`);
    } else {
      summary.updated++;
    }
  }

  return {
    alert_id: alertId,
    kind,
    sid,
    provider_status: normalized.status,
    provider_error_code: normalized.errorCode,
    provider_error_message: normalized.errorMessage,
    would_update: true,
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
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
