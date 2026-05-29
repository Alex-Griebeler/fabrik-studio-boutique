// Webhook da Meta WhatsApp Cloud API.
//
// GET  → handshake de subscrição (hub.mode/hub.verify_token/hub.challenge)
// POST → eventos. Valida X-Hub-Signature-256 e processa SÓ status de
//        entrega (`statuses[]`), atualizando as colunas `*_provider_*`
//        de `attendance_alerts`. Mensagens inbound (`messages[]`) são
//        apenas CONTADAS nesta fase (conversas ficam pro receive-whatsapp
//        Twilio / Marketing IA, fora de escopo).
//
// NÃO altera status do alerta, notified_at, escalated_at,
// acknowledged_at, resolved_at, mode — só os campos provider.
//
// Auth: a Meta não manda Bearer; a autenticidade vem da assinatura
// HMAC. Por isso `verify_jwt = false` no config.toml e validação via
// `verifyMetaSignature` com `META_WA_APP_SECRET`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizeMetaStatus,
  parseMetaWebhookPayload,
  verifyMetaSignature,
  verifyMetaSubscription,
} from "../_shared/whatsapp/metaWebhook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

interface WebhookSummary {
  ok: boolean;
  statuses_seen: number;
  message_updates: number;
  escalation_updates: number;
  unmatched: number;
  inbound_messages_seen: number;
  errors: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ─── GET: handshake de subscrição ───
  if (req.method === "GET") {
    const url = new URL(req.url);
    const challenge = verifyMetaSubscription({
      mode: url.searchParams.get("hub.mode"),
      token: url.searchParams.get("hub.verify_token"),
      challenge: url.searchParams.get("hub.challenge"),
      expectedToken: Deno.env.get("META_WA_WEBHOOK_VERIFY_TOKEN") ?? null,
    });
    if (challenge === null) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
    // Challenge ecoado em texto puro (Meta exige body cru).
    return new Response(challenge, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  try {
    // ─── Lê raw body ANTES de parsear (assinatura é sobre o raw) ───
    const rawBody = await req.text();

    const appSecret = Deno.env.get("META_WA_APP_SECRET");
    const signature = req.headers.get("x-hub-signature-256");
    const validSig = await verifyMetaSignature(rawBody, signature, appSecret);
    if (!validSig) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonError(400, "Invalid JSON");
    }

    const { statuses, inboundMessages } = parseMetaWebhookPayload(payload);

    const summary: WebhookSummary = {
      ok: true,
      statuses_seen: statuses.length,
      message_updates: 0,
      escalation_updates: 0,
      unmatched: 0,
      inbound_messages_seen: inboundMessages.length,
      errors: [],
    };

    if (statuses.length === 0) {
      return jsonOk(summary);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    for (const raw of statuses) {
      const n = normalizeMetaStatus(raw);
      if (!n.wamid) {
        summary.unmatched++;
        continue;
      }

      const checkedAt = new Date().toISOString();

      try {
        // 1) Tenta casar como mensagem principal.
        const { data: msgRows, error: msgErr } = await supabase
          .from("attendance_alerts")
          .update({
            message_provider: "meta",
            message_provider_status: n.status,
            message_provider_error_code: n.errorCode,
            message_provider_error_message: n.errorMessage,
            message_provider_checked_at: checkedAt,
          })
          .eq("message_sid", n.wamid)
          .select("id");
        if (msgErr) {
          summary.errors.push(`msg ${n.wamid}: ${msgErr.message}`);
        } else if (msgRows && msgRows.length > 0) {
          summary.message_updates += msgRows.length;
          continue;
        }

        // 2) Senão, tenta casar como mensagem de escalação.
        const { data: escRows, error: escErr } = await supabase
          .from("attendance_alerts")
          .update({
            escalation_provider: "meta",
            escalation_provider_status: n.status,
            escalation_provider_error_code: n.errorCode,
            escalation_provider_error_message: n.errorMessage,
            escalation_provider_checked_at: checkedAt,
          })
          .eq("escalation_message_sid", n.wamid)
          .select("id");
        if (escErr) {
          summary.errors.push(`esc ${n.wamid}: ${escErr.message}`);
        } else if (escRows && escRows.length > 0) {
          summary.escalation_updates += escRows.length;
          continue;
        }

        // 3) Nenhum match — status de mensagem que não é alerta de falta
        //    (ou ainda não gravada). Não é erro.
        summary.unmatched++;
      } catch (err) {
        summary.errors.push(
          `${n.wamid}: ${(err as Error).message ?? String(err)}`,
        );
      }
    }

    return jsonOk(summary);
  } catch (err) {
    console.error("receive-whatsapp-meta fatal:", err);
    return jsonError(500, (err as Error).message ?? "internal error");
  }
});

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
