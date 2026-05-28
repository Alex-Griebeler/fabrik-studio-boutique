import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireStaffRole } from "../_shared/requireStaffRole.ts";
import {
  buildAdapter,
  parseOutgoing,
  WhatsappBodyError,
  type FactoryEnv,
} from "../_shared/whatsapp/factory.ts";

// Edge function `send-whatsapp` — fina por design.
//
// Quem decide qual provider usar é o factory (`_shared/whatsapp`),
// baseado na env `WHATSAPP_PROVIDER`. Default `twilio`, preservando
// 100% o comportamento original (Twilio sandbox + free-form). Meta
// Cloud API está disponível como opção (`WHATSAPP_PROVIDER=meta`) mas
// inativo até o cutover.
//
// Contrato de body (backward compatible):
//   - Legado: `{to, message}` — vira freeform. Twilio aceita; Meta
//     rejeita (precisa template).
//   - Novo:   `{to, template: {name, language, components?}}` — vira
//     template. Meta aceita; Twilio rejeita.
//
// Contrato de resposta (preservado pra callers existentes):
//   - 200: `{success: true, sid, status, provider}` (provider novo,
//          callers antigos ignoram)
//   - 400: `{error: "..."}` — body inválido
//   - 401/403: vindos do `requireStaffRole`
//   - 500: `{error: "..."}` — falha do provider ou interna
//
// Auth: service_role bearer (chamadas internas) OU usuário com role
// em (admin, manager, reception).

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

    const rawBody = await req.json().catch(() => null);

    // Parse + validação do body
    let outgoing;
    try {
      outgoing = parseOutgoing(rawBody);
    } catch (err) {
      if (err instanceof WhatsappBodyError) {
        return jsonError(400, err.message);
      }
      throw err;
    }

    // Construção do adapter (lê env do Deno via FactoryEnv).
    // Erro de config → 500 (problema do operador, não do caller).
    let adapter;
    try {
      adapter = buildAdapter(readFactoryEnv());
    } catch (err) {
      console.error("send-whatsapp: factory error:", (err as Error).message);
      return jsonError(500, "Credenciais do provider WhatsApp não configuradas");
    }

    try {
      const result = await adapter.send(outgoing);
      return jsonOk({
        success: true,
        sid: result.sid,
        status: result.status,
        provider: adapter.provider,
      });
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      console.error(`send-whatsapp [${adapter.provider}] send error:`, message);
      // Mantém status 500 pra erros do provider; caller decide reagir.
      // Em vez do body antigo `{error, code}`, padronizamos `{error}` —
      // `code` Twilio agora vem dentro da string de error (parseável se
      // alguém precisar mas não quebra contrato JSON).
      return jsonError(500, `Erro ao enviar mensagem: ${message.slice(0, 200)}`);
    }
  } catch (error) {
    console.error("send-whatsapp fatal:", (error as Error).message);
    return jsonError(500, "Erro interno");
  }
});

function readFactoryEnv(): FactoryEnv {
  return {
    WHATSAPP_PROVIDER: Deno.env.get("WHATSAPP_PROVIDER") ?? undefined,
    TWILIO_ACCOUNT_SID: Deno.env.get("TWILIO_ACCOUNT_SID") ?? undefined,
    TWILIO_AUTH_TOKEN: Deno.env.get("TWILIO_AUTH_TOKEN") ?? undefined,
    TWILIO_WHATSAPP_SANDBOX_NUMBER:
      Deno.env.get("TWILIO_WHATSAPP_SANDBOX_NUMBER") ?? undefined,
    META_WA_PHONE_NUMBER_ID:
      Deno.env.get("META_WA_PHONE_NUMBER_ID") ?? undefined,
    META_WA_ACCESS_TOKEN: Deno.env.get("META_WA_ACCESS_TOKEN") ?? undefined,
    META_WA_API_VERSION: Deno.env.get("META_WA_API_VERSION") ?? undefined,
  };
}

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
