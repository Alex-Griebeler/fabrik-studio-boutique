// Adapter Twilio WhatsApp (sandbox e production).
//
// Extrai a lógica que estava inline em `send-whatsapp/index.ts` antes
// da abstração. Preserva 100% o comportamento atual:
//   - POST `api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json`
//   - Basic Auth com `TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN`
//   - Body URL-encoded `To=whatsapp:+55... From=whatsapp:+1... Body=...`
//   - Resposta com `sid` (SMxxxxx) e `status`
//
// Templates: não suportado neste adapter por enquanto. Twilio tem
// Content API pra templates aprovados, mas o sandbox aceita só free-
// form e migrar é desnecessário enquanto Meta é o caminho oficial pra
// templates. Adapter rejeita explicitamente envio de template com
// erro claro, pra evitar fallback silencioso.

import type {
  WhatsappAdapter,
  WhatsappOutgoing,
  WhatsappSendResult,
} from "./types.ts";

export interface TwilioAdapterConfig {
  accountSid: string;
  authToken: string;
  /** Número Twilio que vai aparecer como remetente. Aceita com ou sem prefixo `whatsapp:`. */
  fromNumber: string;
}

export class TwilioAdapter implements WhatsappAdapter {
  readonly provider = "twilio" as const;
  private readonly config: TwilioAdapterConfig;

  constructor(config: TwilioAdapterConfig) {
    this.config = config;
  }

  async send(msg: WhatsappOutgoing): Promise<WhatsappSendResult> {
    if (msg.kind !== "freeform") {
      throw new Error(
        "Twilio adapter does not support template messages — use freeform `{to, message}` or switch provider to meta.",
      );
    }

    const cleanFrom = this.config.fromNumber.trim().replace(/^whatsapp:/, "");
    const toWhatsApp = msg.to.startsWith("whatsapp:")
      ? msg.to
      : `whatsapp:${msg.to}`;
    const fromWhatsApp = `whatsapp:${cleanFrom}`;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;

    const body = new URLSearchParams({
      To: toWhatsApp,
      From: fromWhatsApp,
      Body: msg.message,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + btoa(`${this.config.accountSid}:${this.config.authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = (await response.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      code?: number | string;
      message?: string;
    };

    if (!response.ok) {
      const code = data?.code ?? response.status;
      const detail = data?.message ?? JSON.stringify(data).slice(0, 200);
      throw new Error(`twilio send failed (${code}): ${detail}`);
    }

    return {
      sid: data.sid ?? null,
      status: data.status ?? null,
    };
  }
}
