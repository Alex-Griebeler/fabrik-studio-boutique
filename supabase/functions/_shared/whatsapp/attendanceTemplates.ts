// Builders de payload pra `send-whatsapp` específicos do agente de faltas.
//
// Ponto único onde se decide entre:
//   - Twilio/default: body legado `{to, message}` — texto plano vindo
//     do `_shared/attendance/messaging.ts` (preserva 100% o que vai
//     hoje pra produção)
//   - Meta:           body novo `{to, template: {name, language,
//     components}}` — usa um dos 3 templates UTILITY já submetidos na
//     WABA (fabrik_alerta_falta_grupo, fabrik_alerta_falta_pt,
//     fabrik_escalacao_falta)
//
// Provider é decidido pela env `WHATSAPP_PROVIDER` (default `twilio`),
// resolvida pelo factory já existente. `send-whatsapp` valida o body
// e despacha pro adapter correto — nada aqui faz I/O.

import {
  buildEscalationMessage,
  buildTrainerAlertMessage,
  type AlertMessageContext,
  type EscalationMessageContext,
} from "../attendance/messaging.ts";
import { resolveProvider } from "./factory.ts";

const TEMPLATE_LANGUAGE = "pt_BR";

const TEMPLATE_NAMES = {
  group: "fabrik_alerta_falta_grupo",
  pt: "fabrik_alerta_falta_pt",
  escalation: "fabrik_escalacao_falta",
} as const;

// ─────────── Tipos do body que `send-whatsapp` aceita ───────────

export interface WhatsappFreeformBody {
  to: string;
  message: string;
}

export interface WhatsappTemplateBody {
  to: string;
  template: {
    name: string;
    language: string;
    components: unknown[];
  };
}

export type WhatsappSendBody = WhatsappFreeformBody | WhatsappTemplateBody;

// ─────────── Dados de domínio (input) ───────────

export interface TrainerAlertData {
  to: string;
  /** Token aleatório que vai no link de ack — `?token={{1}}` no template. */
  ackToken: string;
  /** URL completa do ack — usada só no path Twilio (no Meta, vai pelo button param). */
  ackUrl: string;
  studentName: string;
  planLabel: string;
  /** ISO yyyy-mm-dd. */
  lastAttendedAt: string | null;
  /** ISO yyyy-mm-dd, do mais antigo pro mais recente. */
  missedDates: string[];
  alertType: AlertMessageContext["alertType"];
}

export interface EscalationData extends TrainerAlertData {
  trainerName: string;
  hoursOpen: number;
}

// ─────────── Resolver de provider (re-export wrapper) ───────────

/**
 * Wrapper conveniente sobre `resolveProvider`. Default `twilio` se
 * `raw` é undefined/vazio. Edge function passa
 * `Deno.env.get("WHATSAPP_PROVIDER") ?? undefined`.
 */
export function currentWhatsappProvider(
  raw: string | undefined,
): "twilio" | "meta" {
  return resolveProvider(raw);
}

// ─────────── Formatadores compartilhados ───────────

function fmtShortDate(iso: string): string {
  // yyyy-mm-dd → dd/MM
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

function joinDates(dates: ReadonlyArray<string>): string {
  if (dates.length === 0) return "—";
  if (dates.length === 1) return fmtShortDate(dates[0]);
  if (dates.length === 2) {
    return `${fmtShortDate(dates[0])} e ${fmtShortDate(dates[1])}`;
  }
  const head = dates.slice(0, -1).map(fmtShortDate).join(", ");
  return `${head} e ${fmtShortDate(dates[dates.length - 1])}`;
}

function lastSeenLabel(iso: string | null): string {
  return iso ? fmtShortDate(iso) : "Sem presença recente registrada";
}

// ─────────── Builders DE TEMPLATE (Meta) ───────────

function buttonComponent(ackToken: string): Record<string, unknown> {
  return {
    type: "button",
    sub_type: "url",
    index: "0",
    parameters: [{ type: "text", text: ackToken }],
  };
}

function textParam(text: string): Record<string, unknown> {
  return { type: "text", text };
}

/**
 * fabrik_alerta_falta_grupo:
 *   header `{{1}}` = qtd faltas (string)
 *   body   `{{1..5}}` = qtd, aluno, plano, última presença, faltas
 *   button `{{1}}` = ack_token
 */
function buildTrainerGroupTemplate(data: TrainerAlertData): WhatsappTemplateBody["template"] {
  const qty = String(data.missedDates.length);
  return {
    name: TEMPLATE_NAMES.group,
    language: TEMPLATE_LANGUAGE,
    components: [
      {
        type: "header",
        parameters: [textParam(qty)],
      },
      {
        type: "body",
        parameters: [
          textParam(qty),
          textParam(data.studentName),
          textParam(data.planLabel),
          textParam(lastSeenLabel(data.lastAttendedAt)),
          textParam(joinDates(data.missedDates)),
        ],
      },
      buttonComponent(data.ackToken),
    ],
  };
}

/**
 * fabrik_alerta_falta_pt:
 *   header sem variável
 *   body   `{{1..4}}` = aluno, plano, última presença, data da falta
 *   button `{{1}}` = ack_token
 */
function buildTrainerPtTemplate(data: TrainerAlertData): WhatsappTemplateBody["template"] {
  const onlyMiss = data.missedDates[0] ?? "";
  return {
    name: TEMPLATE_NAMES.pt,
    language: TEMPLATE_LANGUAGE,
    components: [
      {
        type: "body",
        parameters: [
          textParam(data.studentName),
          textParam(data.planLabel),
          textParam(lastSeenLabel(data.lastAttendedAt)),
          textParam(onlyMiss ? fmtShortDate(onlyMiss) : "—"),
        ],
      },
      buttonComponent(data.ackToken),
    ],
  };
}

/**
 * fabrik_escalacao_falta:
 *   header sem variável
 *   body   `{{1..6}}` = horas em aberto, treinador titular, aluno,
 *                       plano, última presença, faltas
 *   button `{{1}}` = ack_token
 */
function buildEscalationTemplate(data: EscalationData): WhatsappTemplateBody["template"] {
  return {
    name: TEMPLATE_NAMES.escalation,
    language: TEMPLATE_LANGUAGE,
    components: [
      {
        type: "body",
        parameters: [
          textParam(String(data.hoursOpen)),
          textParam(data.trainerName),
          textParam(data.studentName),
          textParam(data.planLabel),
          textParam(lastSeenLabel(data.lastAttendedAt)),
          textParam(joinDates(data.missedDates)),
        ],
      },
      buttonComponent(data.ackToken),
    ],
  };
}

// ─────────── Builders DE BODY (escolhem twilio vs meta) ───────────

/**
 * Monta body completo pra `send-whatsapp` no fluxo "alerta de falta
 * pro treinador titular". Para Twilio, devolve o texto que o
 * `buildTrainerAlertMessage` já gera há tempos (zero diff visual).
 * Para Meta, devolve o template estruturado correspondente ao
 * `alert_type`.
 */
export function buildTrainerAlertBody(
  data: TrainerAlertData,
  provider: "twilio" | "meta",
): WhatsappSendBody {
  if (provider === "twilio") {
    const ctx: AlertMessageContext = {
      studentName: data.studentName,
      planLabel: data.planLabel,
      lastAttendedAt: data.lastAttendedAt,
      missedDates: data.missedDates,
      ackUrl: data.ackUrl,
      alertType: data.alertType,
    };
    return { to: data.to, message: buildTrainerAlertMessage(ctx) };
  }
  const template =
    data.alertType === "pt_1_miss"
      ? buildTrainerPtTemplate(data)
      : buildTrainerGroupTemplate(data);
  return { to: data.to, template };
}

/**
 * Mesma ideia pro fluxo de escalação pro fallback trainer.
 */
export function buildEscalationBody(
  data: EscalationData,
  provider: "twilio" | "meta",
): WhatsappSendBody {
  if (provider === "twilio") {
    const ctx: EscalationMessageContext = {
      studentName: data.studentName,
      planLabel: data.planLabel,
      lastAttendedAt: data.lastAttendedAt,
      missedDates: data.missedDates,
      ackUrl: data.ackUrl,
      alertType: data.alertType,
      trainerName: data.trainerName,
      hoursOpen: data.hoursOpen,
    };
    return { to: data.to, message: buildEscalationMessage(ctx) };
  }
  return { to: data.to, template: buildEscalationTemplate(data) };
}
