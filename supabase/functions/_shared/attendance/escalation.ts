// Lógica pura de decisão de escalação de attendance_alerts.
// Sem I/O. Determinística e testável.
//
// Regras de produto (Maio/2026):
//   - Alerta novo SEMPRE nasce `pending` com `escalated_at=null`.
//   - Detector apenas notifica (treinador titular ou shadow_phone). Nunca
//     escala na mesma run em que cria o alerta.
//   - Escalação só ocorre via `escalate-attendance-alerts` quando o alerta
//     pending continua sem ack após `escalationHours` (default 24h)
//     CONTADAS A PARTIR DO PRIMEIRO PING ao treinador (`notified_at`).
//   - Se `notified_at IS NULL` o alerta NUNCA escala — não há marco a
//     contar. `created_at` NÃO é fallback válido pra essa decisão; um
//     alerta criado fora da janela de envio fica esperando o próximo
//     ping antes de iniciar o relógio de 24h.

export interface NewAlertInitialState {
  status: "pending";
  escalated_at: null;
}

/**
 * Estado inicial canônico de um alerta recém-detectado.
 * Existe como função pura pra travar a regra em teste.
 */
export function newAlertInitialState(): NewAlertInitialState {
  return { status: "pending", escalated_at: null };
}

export interface EscalationCandidate {
  id: string;
  status: "pending" | "escalated";
  acknowledged_at: string | null;
  escalated_at: string | null;
  notified_at: string | null;
  /** Mantido na interface por compatibilidade de payload, mas IGNORADO na decisão. */
  created_at?: string;
}

export interface ShouldEscalateOptions {
  now: Date;
  escalationHours: number;
}

export interface ShouldEscalateResult {
  escalate: boolean;
  reason: string;
}

/**
 * Decide se um alerta deve ser escalado AGORA.
 *
 * Retorna `escalate=false` (com motivo) quando:
 *   - status já não é `pending`
 *   - já foi acknowledged
 *   - já foi escalado em algum momento
 *   - ainda não foi notificado (`notified_at IS NULL`)
 *   - `notified_at` em formato inválido
 *   - idade desde `notified_at` ainda menor que `escalationHours`
 */
export function shouldEscalate(
  alert: EscalationCandidate,
  opts: ShouldEscalateOptions,
): ShouldEscalateResult {
  if (alert.status !== "pending") {
    return { escalate: false, reason: `status_${alert.status}` };
  }
  if (alert.acknowledged_at) {
    return { escalate: false, reason: "already_acknowledged" };
  }
  if (alert.escalated_at) {
    return { escalate: false, reason: "already_escalated" };
  }
  if (!alert.notified_at) {
    return { escalate: false, reason: "not_notified_yet" };
  }
  const baseMs = Date.parse(alert.notified_at);
  if (Number.isNaN(baseMs)) {
    return { escalate: false, reason: "invalid_notified_at" };
  }

  const ageMs = opts.now.getTime() - baseMs;
  const thresholdMs = opts.escalationHours * 3600_000;

  if (ageMs < thresholdMs) {
    return { escalate: false, reason: "too_recent" };
  }

  return { escalate: true, reason: "aged_since_notified" };
}
