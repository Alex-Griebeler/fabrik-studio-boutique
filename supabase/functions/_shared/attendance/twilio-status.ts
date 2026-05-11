// Normalizador puro do payload do endpoint Twilio Messages
// (`GET /2010-04-01/Accounts/{sid}/Messages/{sid}.json`).
//
// Sem I/O — função recebe payload já parseado (unknown), faz cast
// defensivo e devolve forma canônica { status, errorCode, errorMessage }
// que vai pras colunas `*_provider_*` em `attendance_alerts`.

export interface NormalizedTwilioStatus {
  status: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Normaliza um payload Twilio Message.
 *
 * Twilio retorna campos:
 *   - status: "queued" | "sent" | "delivered" | "undelivered" | "failed" | ...
 *   - error_code: number | null  (ex: 63015)
 *   - error_message: string | null
 *
 * Convertemos error_code pra string pra caber em `text` (preserva nulls).
 */
export function normalizeTwilioMessageStatus(
  payload: unknown,
): NormalizedTwilioStatus {
  if (!payload || typeof payload !== "object") {
    return { status: null, errorCode: null, errorMessage: null };
  }
  const p = payload as Record<string, unknown>;

  const status = typeof p.status === "string" && p.status.length > 0
    ? p.status
    : null;

  let errorCode: string | null = null;
  const rawCode = p.error_code;
  if (typeof rawCode === "string" && rawCode.length > 0) {
    errorCode = rawCode;
  } else if (typeof rawCode === "number" && Number.isFinite(rawCode)) {
    errorCode = String(rawCode);
  }

  const errorMessage =
    typeof p.error_message === "string" && p.error_message.length > 0
      ? p.error_message
      : null;

  return { status, errorCode, errorMessage };
}

/**
 * Classifica um status como "terminal pra delivery confirmada"
 * (delivered) vs "terminal pra falha" (failed/undelivered) vs
 * "ainda em trânsito" (queued/sent/accepted/sending).
 *
 * Não consumido diretamente pela function — exportado pra futuras UIs
 * ou métricas. Tipos baseados em https://www.twilio.com/docs/messaging/api/message-resource#message-status-values
 */
export type TwilioDeliveryOutcome =
  | "delivered"
  | "failed"
  | "in_transit"
  | "unknown";

export function classifyTwilioStatus(
  status: string | null,
): TwilioDeliveryOutcome {
  if (!status) return "unknown";
  const s = status.toLowerCase();
  if (s === "delivered" || s === "read") return "delivered";
  if (s === "failed" || s === "undelivered") return "failed";
  if (
    s === "queued" ||
    s === "accepted" ||
    s === "sending" ||
    s === "sent" ||
    s === "scheduled"
  ) {
    return "in_transit";
  }
  return "unknown";
}
