// Factory + parser do body de entrada da `send-whatsapp` edge function.
//
// 2 responsabilidades, deliberadamente juntas pra facilitar teste:
//   1. `resolveProvider(raw)` — normaliza a env var `WHATSAPP_PROVIDER`
//      em `"twilio" | "meta"`. Default `twilio` (sem mudar nada se env
//      ausente). Rejeita valores desconhecidos.
//   2. `buildAdapter(env)` — instancia o adapter certo, validando
//      presença de secrets exigidos. Erro early se faltar.
//   3. `parseOutgoing(body)` — converte o JSON recebido pela edge
//      function num `WhatsappOutgoing` tipado. Aceita os dois shapes:
//        - legado: `{to, message}` → freeform
//        - novo:   `{to, template: {...}}` → template
//      Rejeita ausência de campos obrigatórios.

import type {
  WhatsappAdapter,
  WhatsappOutgoing,
  WhatsappProvider,
} from "./types.ts";
import { TwilioAdapter } from "./twilio.ts";
import { MetaAdapter } from "./meta.ts";

/** Subset da env do Deno consumido pelo factory. */
export interface FactoryEnv {
  WHATSAPP_PROVIDER?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WHATSAPP_SANDBOX_NUMBER?: string;
  META_WA_PHONE_NUMBER_ID?: string;
  META_WA_ACCESS_TOKEN?: string;
  META_WA_API_VERSION?: string;
}

export function resolveProvider(raw: string | undefined): WhatsappProvider {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "" || normalized === "twilio") return "twilio";
  if (normalized === "meta") return "meta";
  throw new Error(
    `Unknown WHATSAPP_PROVIDER "${raw}". Expected "twilio" or "meta".`,
  );
}

export function buildAdapter(env: FactoryEnv): WhatsappAdapter {
  const provider = resolveProvider(env.WHATSAPP_PROVIDER);
  if (provider === "twilio") return buildTwilio(env);
  return buildMeta(env);
}

function buildTwilio(env: FactoryEnv): TwilioAdapter {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const fromNumber = env.TWILIO_WHATSAPP_SANDBOX_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      "Twilio adapter: missing one of TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_SANDBOX_NUMBER",
    );
  }
  return new TwilioAdapter({ accountSid, authToken, fromNumber });
}

function buildMeta(env: FactoryEnv): MetaAdapter {
  const phoneNumberId = env.META_WA_PHONE_NUMBER_ID;
  const accessToken = env.META_WA_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error(
      "Meta adapter: missing one of META_WA_PHONE_NUMBER_ID / META_WA_ACCESS_TOKEN",
    );
  }
  return new MetaAdapter({
    phoneNumberId,
    accessToken,
    apiVersion: env.META_WA_API_VERSION,
  });
}

/**
 * Erro de parsing/validação do body. `send-whatsapp/index.ts` captura
 * isso e retorna 400 com a mensagem pro caller.
 */
export class WhatsappBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsappBodyError";
  }
}

/**
 * Aceita os 2 shapes:
 *   - legado: `{to, message}` → freeform (Twilio default)
 *   - novo:   `{to, template: {name, language, components?}}` → template
 *
 * Se ambos estiverem presentes, prevalece `template` (caller escolheu
 * explicitamente). Validações:
 *   - `to` obrigatório, string não-vazia
 *   - freeform: `message` string não-vazia
 *   - template: `name` e `language` strings não-vazias; `components`
 *     se presente deve ser array (qualquer formato, repassado tal qual)
 */
export function parseOutgoing(raw: unknown): WhatsappOutgoing {
  if (!raw || typeof raw !== "object") {
    throw new WhatsappBodyError("body deve ser um objeto JSON");
  }
  const body = raw as Record<string, unknown>;

  const to = body.to;
  if (typeof to !== "string" || to.trim().length === 0) {
    throw new WhatsappBodyError("campo 'to' obrigatório e não-vazio");
  }

  if (body.template !== undefined && body.template !== null) {
    if (typeof body.template !== "object") {
      throw new WhatsappBodyError("'template' deve ser objeto");
    }
    const t = body.template as Record<string, unknown>;
    const name = t.name;
    const language = t.language;
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new WhatsappBodyError("'template.name' obrigatório");
    }
    if (typeof language !== "string" || language.trim().length === 0) {
      throw new WhatsappBodyError("'template.language' obrigatório (ex: pt_BR)");
    }
    const components = t.components;
    if (components !== undefined && !Array.isArray(components)) {
      throw new WhatsappBodyError("'template.components' deve ser array");
    }
    return {
      kind: "template",
      to,
      template: {
        name,
        language,
        ...(components !== undefined ? { components: components } : {}),
      },
    };
  }

  const message = body.message;
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new WhatsappBodyError(
      "campo 'message' obrigatório (ou use 'template' pra envio por template)",
    );
  }
  return { kind: "freeform", to, message };
}
