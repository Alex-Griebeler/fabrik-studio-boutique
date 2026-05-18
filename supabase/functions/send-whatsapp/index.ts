import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireStaffRole } from "../_shared/requireStaffRole.ts";

// Auth: service_role bearer (chamadas internas — outras edge
// functions, cron) OU usuário autenticado com role em
// (admin, manager, reception). Aluno autenticado NÃO pode disparar
// mensagem via essa function — fluxo antigo aceitava qualquer JWT
// válido sem checar role.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireStaffRole({
      req,
      allowed: ["admin", "manager", "reception"],
      allowServiceRole: true,
    });
    if (auth instanceof Response) return auth;

    const { to, message } = await req.json();

    if (!to || !message) {
      return new Response(
        JSON.stringify({ error: "Campos 'to' e 'message' são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_WHATSAPP_SANDBOX_NUMBER");

    if (!accountSid || !authToken || !fromNumber) {
      return new Response(
        JSON.stringify({ error: "Credenciais Twilio não configuradas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanFrom = fromNumber.trim().replace(/^whatsapp:/, "");
    const toWhatsApp = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    const fromWhatsApp = `whatsapp:${cleanFrom}`;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const body = new URLSearchParams({
      To: toWhatsApp,
      From: fromWhatsApp,
      Body: message,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Twilio error:", data);
      return new Response(
        JSON.stringify({ error: "Erro ao enviar mensagem", code: data?.code ?? null }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, sid: data.sid, status: data.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-whatsapp fatal:", (error as Error).message);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
