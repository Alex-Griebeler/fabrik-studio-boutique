import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveTwilioWebhookUrl,
  verifyTwilioSignature,
} from "../_shared/whatsapp/twilioWebhook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Webhook endpoint for incoming WhatsApp messages from Twilio.
 * Twilio sends POST with form-urlencoded body containing:
 * - From: whatsapp:+5511999999999
 * - Body: message text
 * - To: whatsapp:+14155238886
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Twilio sends POST with form-urlencoded
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // A3.3a: assinatura da Twilio validada ANTES de qualquer leitura ou
    // escrita. Sem token configurado a função falha fechada (500); sem
    // assinatura válida a request não é da Twilio (403).
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!TWILIO_AUTH_TOKEN) {
      console.error("receive-whatsapp: TWILIO_AUTH_TOKEN ausente — fail closed");
      return new Response("Server misconfigured", { status: 500 });
    }

    // Parse Twilio webhook payload (form-urlencoded). Todos os campos
    // entram no cálculo da assinatura.
    const formData = await req.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") params[key] = value;
    }

    // URL canônica vem de TWILIO_WEBHOOK_URL (a URL exata configurada no
    // console da Twilio); atrás de proxy o req.url pode divergir da URL
    // assinada. Fallback: req.url.
    const webhookUrl = resolveTwilioWebhookUrl(
      Deno.env.get("TWILIO_WEBHOOK_URL"),
      req.url,
    );
    const signatureOk = await verifyTwilioSignature({
      url: webhookUrl,
      params,
      signatureHeader: req.headers.get("X-Twilio-Signature"),
      authToken: TWILIO_AUTH_TOKEN,
    });
    if (!signatureOk) {
      console.error("receive-whatsapp: assinatura Twilio inválida — 403");
      return new Response("Forbidden", { status: 403 });
    }

    const from = params["From"] ?? "";
    const body = params["Body"] ?? "";
    const messageSid = (params["MessageSid"] ?? "").trim();

    // A3.3a: MessageSid é obrigatório — é a chave de dedupe de retries
    // (inbox durável chega no A3.3b).
    if (!messageSid) {
      console.error("receive-whatsapp: MessageSid ausente — 400");
      return new Response("Bad Request", { status: 400 });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Extract phone number from "whatsapp:+5511999999999" format
    const phone = from.replace("whatsapp:", "").trim();

    if (!phone || !body) {
      console.error(`receive-whatsapp: payload sem From/Body utilizáveis (sid ${messageSid})`);
      // Return 200 to Twilio so it doesn't retry
      return new Response("<Response></Response>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    console.log(`receive-whatsapp: mensagem recebida (sid ${messageSid})`);

    // Find the lead by phone number
    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, status")
      .or(`phone.eq.${phone},phone.eq.${phone.replace("+55", "")}`)
      .limit(1)
      .single();

    if (!lead) {
      console.log(`receive-whatsapp: nenhum lead para o remetente (sid ${messageSid}). Ignorando.`);
      return new Response("<Response></Response>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Find or create conversation for this lead
    let conversationId: string;

    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id, status")
      .eq("lead_id", lead.id)
      .eq("channel", "whatsapp")
      .in("status", ["active", "human_control", "needs_handoff"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      // Create new conversation
      const { data: newConv, error: createErr } = await supabase
        .from("conversations")
        .insert({
          lead_id: lead.id,
          channel: "whatsapp",
          status: "active",
          topic: `WhatsApp - ${lead.name}`,
        })
        .select("id")
        .single();

      if (createErr || !newConv) {
        console.error("Failed to create conversation:", createErr);
        return new Response("<Response></Response>", {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        });
      }
      conversationId = newConv.id;
    }

    // Save the incoming message
    await supabase.from("conversation_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: body,
      ai_generated: false,
      metadata: { source: "twilio_webhook", message_sid: messageSid },
    });

    // Update conversation timestamp
    await supabase.from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    // Check if conversation is under human control - if so, don't auto-respond
    const convStatus = existingConv?.status;
    if (convStatus === "human_control") {
      console.log("Conversation under human control, skipping AI response");
      return new Response("<Response></Response>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Get active agent config to check auto_respond
    const { data: agent } = await supabase
      .from("ai_agent_config")
      .select("behavior_config")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const behaviorConfig = (agent?.behavior_config as Record<string, unknown>) || {};
    if (behaviorConfig.auto_respond === false) {
      console.log("Auto-respond disabled, skipping AI response");
      return new Response("<Response></Response>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Trigger AI processing via the existing edge function
    try {
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
      // Use internal invocation with service role
      await fetch(`${SUPABASE_URL}/functions/v1/process-conversation-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ conversation_id: conversationId, message: body }),
      });
    } catch (aiError) {
      console.error("Failed to trigger AI processing:", aiError);
      // Don't fail the webhook - message is already saved
    }

    // Return empty TwiML response (we handle reply via send-whatsapp)
    return new Response("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (e) {
    console.error("receive-whatsapp error:", e);
    // Always return 200 to Twilio to prevent retries
    return new Response("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
});
