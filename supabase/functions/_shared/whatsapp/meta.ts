// Adapter Meta WhatsApp Cloud API.
//
// Endpoint: POST https://graph.facebook.com/{version}/{phone_number_id}/messages
// Auth: Bearer (System User token ou temporário de 24h).
//
// **Inativo por default.** Só é selecionado pelo factory quando
// `WHATSAPP_PROVIDER=meta`. Enquanto a WABA de produção da Fabrik
// estiver pendente e os secrets `META_WA_*` não estiverem
// configurados no Supabase, este adapter não recebe tráfego em
// produção — mas está pronto pra cutover.
//
// Restrição da Meta: envio proativo (fora da janela de 24h após a
// última mensagem do destinatário) só com TEMPLATE APROVADO. Como
// alertas de faltas são sempre proativos, o adapter NÃO aceita
// free-form — força o caller a usar `{to, template: {name, language,
// components?}}`. Rejeição é com erro claro pra a UI/log mostrar o
// problema real (não falha silenciosa).

import type {
  WhatsappAdapter,
  WhatsappOutgoing,
  WhatsappSendResult,
} from "./types.ts";

export interface MetaAdapterConfig {
  /** Phone Number ID da WABA (path da URL Graph). NÃO é o número E.164. */
  phoneNumberId: string;
  /** Token Bearer (System User ou temporário). */
  accessToken: string;
  /** Default `v25.0` se não informado. */
  apiVersion?: string;
}

interface MetaSendResponse {
  messaging_product?: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string; message_status?: string }>;
  error?: { message?: string; code?: number; error_subcode?: number };
}

export class MetaAdapter implements WhatsappAdapter {
  readonly provider = "meta" as const;
  private readonly config: MetaAdapterConfig;

  constructor(config: MetaAdapterConfig) {
    this.config = config;
  }

  async send(msg: WhatsappOutgoing): Promise<WhatsappSendResult> {
    if (msg.kind !== "template") {
      throw new Error(
        "Meta adapter requires a template message — free-form is only valid inside the 24h session window. Pass `{to, template: {name, language, components?}}`.",
      );
    }

    const version = this.config.apiVersion ?? "v25.0";
    const url = `https://graph.facebook.com/${version}/${this.config.phoneNumberId}/messages`;

    const body: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: stripWhatsappPrefix(msg.to),
      type: "template",
      template: {
        name: msg.template.name,
        language: { code: msg.template.language },
        ...(msg.template.components
          ? { components: msg.template.components }
          : {}),
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json().catch(() => ({}))) as MetaSendResponse;

    if (!response.ok) {
      const detail =
        data?.error?.message ?? JSON.stringify(data).slice(0, 200);
      const code = data?.error?.code ?? response.status;
      throw new Error(`meta send failed (${code}): ${detail}`);
    }

    const first = data.messages?.[0];
    return {
      sid: first?.id ?? null,
      status: first?.message_status ?? null,
    };
  }
}

/**
 * Remove `whatsapp:` se vier (formato do Twilio); Meta aceita só E.164.
 */
function stripWhatsappPrefix(to: string): string {
  return to.replace(/^whatsapp:/, "").trim();
}
