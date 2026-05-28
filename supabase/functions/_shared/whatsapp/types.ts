// Interfaces compartilhadas pelos adapters de WhatsApp.
//
// Suportamos hoje 2 provedores:
//   - twilio (sandbox/production): free-form com opt-in
//   - meta (Cloud API direto): templates obrigatórios pra envio
//     proativo (fora da janela de 24h)
//
// O contrato é deliberadamente magro pra `send-whatsapp/index.ts`
// poder receber o body legado `{to, message}` E o novo
// `{to, template: {...}}` sem precisar saber qual provider está
// configurado — quem decide e despacha é o adapter via `factory.ts`.

export type WhatsappProvider = "twilio" | "meta";

/**
 * Mensagem free-form: texto plano. Adequada quando o canal aceita
 * envio livre (Twilio sandbox, ou Meta dentro da janela de 24h).
 */
export interface WhatsappFreeformMessage {
  kind: "freeform";
  /** Número destinatário em E.164 (`+55...`) ou no formato `whatsapp:+55...`. */
  to: string;
  message: string;
}

/**
 * Mensagem por template aprovado. Único formato aceito pelo Meta
 * Cloud API pra envio proativo (fora da janela de 24h). Templates
 * precisam estar aprovados na WABA do sender antes do envio.
 */
export interface WhatsappTemplateMessage {
  kind: "template";
  to: string;
  template: {
    /** Nome do template aprovado, ex: `fabrik_alerta_falta_grupo`. */
    name: string;
    /** BCP-47, ex: `pt_BR`, `en_US`. */
    language: string;
    /**
     * `components` no formato Meta — array de objetos
     * `{type: "header"|"body"|"button", parameters: [...]}`.
     * Opcional pra templates sem variáveis (ex: `hello_world`).
     * Passado tal qual pro Graph API; cada adapter decide se usa.
     */
    components?: unknown[];
  };
}

export type WhatsappOutgoing = WhatsappFreeformMessage | WhatsappTemplateMessage;

/**
 * Retorno padronizado de envio, neutro de provider.
 *
 * - `sid` é o identificador externo da mensagem no provider:
 *     - Twilio: `SMxxxxx...`
 *     - Meta:   `wamid.XXX...`
 *   `send-whatsapp/index.ts` mapeia esse campo na resposta JSON como
 *   `sid` (mantém contrato com callers existentes que gravam em
 *   `attendance_alerts.message_sid`).
 *
 * - `status` é o status reportado pelo provider no momento do envio
 *   (Twilio: `queued|sent|...`; Meta: `accepted`). Pode ser null em
 *   provedores que não devolvem status síncrono.
 */
export interface WhatsappSendResult {
  sid: string | null;
  status: string | null;
}

export interface WhatsappAdapter {
  readonly provider: WhatsappProvider;
  send(msg: WhatsappOutgoing): Promise<WhatsappSendResult>;
}
