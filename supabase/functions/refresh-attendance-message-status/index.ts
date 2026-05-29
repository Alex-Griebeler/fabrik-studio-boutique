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
import { providerForSid } from "../_shared/whatsapp/provider.ts";

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
  message_provider: string | null;
  escalation_provider: string | null;
}

type RefreshKind = "message" | "escalation";

interface RefreshResult {
  alert_id: string;
  kind: RefreshKind;
  sid: string;
  provider: string;
  provider_status: string | null;
  provider_error_code: string | null;
  provider_error_message: string | null;
  would_update: boolean;
  note?: string;
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

    // Carrega alertas alvo PRIMEIRO. Twilio só é exigido se de fato
    // houver algum SID Twilio na leva — assim, num cenário 100% Meta
    // (pós-cutover, Twilio removido), o refresh não falha por env
    // ausente. Status Meta chega via webhook (`receive-whatsapp-meta`),
    // não por pull aqui.
    const alerts = await loadAlerts(supabase, body.alertId, limit);

    // Twilio env — lazy: só valida se existir item Twilio de verdade.
    const hasTwilioItem = alerts.some(
      (row) =>
        (row.message_sid &&
          providerForSid(row.message_provider, row.message_sid) === "twilio") ||
        (row.escalation_message_sid &&
          providerForSid(
            row.escalation_provider,
            row.escalation_message_sid,
          ) === "twilio"),
    );

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (hasTwilioItem && (!accountSid || !authToken)) {
      return jsonError(500, "Twilio env not configured");
    }
    // `undefined` quando não há Twilio configurado/necessário —
    // `refreshOne` só usa isso no ramo provider==="twilio".
    const twilioAuth =
      accountSid && authToken
        ? "Basic " + btoa(`${accountSid}:${authToken}`)
        : undefined;

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
          provider: providerForSid(row.message_provider, row.message_sid),
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
          provider: providerForSid(
            row.escalation_provider,
            row.escalation_message_sid,
          ),
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
      .select("id, message_sid, escalation_message_sid, message_provider, escalation_provider")
      .eq("id", alertId)
      .maybeSingle();
    if (error) throw new Error(`load alert ${alertId}: ${error.message}`);
    if (!data) return [];
    return [data as AlertRow];
  }
  const { data, error } = await supabase
    .from("attendance_alerts")
    .select("id, message_sid, escalation_message_sid, message_provider, escalation_provider")
    .or("message_sid.not.is.null,escalation_message_sid.not.is.null")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`load alerts: ${error.message}`);
  return (data ?? []) as AlertRow[];
}

interface RefreshArgs {
  supabase: SupabaseClient;
  /** undefined quando não há Twilio configurado (cenário 100% Meta). */
  accountSid?: string;
  /** undefined quando não há Twilio configurado. */
  twilioAuth?: string;
  alertId: string;
  kind: RefreshKind;
  sid: string;
  provider: "twilio" | "meta";
  dryRun: boolean;
  summary: RefreshSummary;
}

async function refreshOne(args: RefreshArgs): Promise<RefreshResult | null> {
  const { supabase, accountSid, twilioAuth, alertId, kind, sid, provider, dryRun, summary } = args;
  summary.checked++;

  // Meta: status chega via webhook push (`receive-whatsapp-meta`), não
  // por pull. NÃO consultamos Twilio nem Graph API aqui — só reportamos
  // o que já está gravado, sem marcar erro.
  if (provider === "meta") {
    const { data: row } = await supabase
      .from("attendance_alerts")
      .select(
        kind === "message"
          ? "message_provider_status, message_provider_error_code, message_provider_error_message"
          : "escalation_provider_status, escalation_provider_error_code, escalation_provider_error_message",
      )
      .eq("id", alertId)
      .maybeSingle();
    const r = (row ?? {}) as Record<string, string | null>;
    const prefix = kind === "message" ? "message" : "escalation";
    return {
      alert_id: alertId,
      kind,
      sid,
      provider: "meta",
      provider_status: r[`${prefix}_provider_status`] ?? null,
      provider_error_code: r[`${prefix}_provider_error_code`] ?? null,
      provider_error_message: r[`${prefix}_provider_error_message`] ?? null,
      would_update: false,
      note: "meta_status_via_webhook",
    };
  }

  // Twilio: precisa de env. Se faltar (item Twilio mas sem credencial),
  // registra erro por item e segue — não derruba o lote.
  if (!accountSid || !twilioAuth) {
    summary.errors.push(
      `alert ${alertId} (${kind}) sid ${sid}: twilio env ausente`,
    );
    return null;
  }

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
    provider: "twilio",
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
