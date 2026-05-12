// Lógica pura do healthcheck do canal WhatsApp do agente de faltas.
// Sem I/O. Determinística e testável em vitest.

export type HealthcheckOutcome = "ok" | "pending" | "failed";

/**
 * Classifica o status final retornado pela Twilio Messages API:
 *
 *   - `delivered` / `read`                                 → ok
 *   - `failed` / `undelivered`                             → failed
 *   - `queued` / `accepted` / `sending` / `sent` / `scheduled` → pending
 *   - qualquer outro / null                                → pending (conservador,
 *                                                            só considera failed
 *                                                            quando Twilio é explícita)
 *
 * O healthcheck NÃO conta "pending" como falha: aguarda próximo run.
 * Só dispara escalation quando há `failed`/`undelivered` consecutivos.
 */
export function classifyHealthcheckResult(
  twilioStatus: string | null | undefined,
): HealthcheckOutcome {
  if (!twilioStatus) return "pending";
  const s = twilioStatus.toLowerCase();
  if (s === "delivered" || s === "read") return "ok";
  if (s === "failed" || s === "undelivered") return "failed";
  if (
    s === "queued" ||
    s === "accepted" ||
    s === "sending" ||
    s === "sent" ||
    s === "scheduled"
  ) {
    return "pending";
  }
  return "pending";
}

/**
 * Decide se o healthcheck deve disparar alerta de escalação ao operador
 * (Alex), baseado no número de falhas consecutivas e no threshold
 * configurado em `attendance_agent_runtime_config.healthcheck_threshold`.
 *
 * Critério: dispara quando `consecutiveFailures >= threshold`. Defensivo
 * contra threshold inválido (≤ 0 vira 1, ou seja, alerta no 1º fail).
 */
export function decideAlertEscalation(args: {
  consecutiveFailures: number;
  threshold: number;
}): { shouldAlert: boolean } {
  const safeThreshold = Math.max(1, Math.floor(args.threshold));
  const shouldAlert = args.consecutiveFailures >= safeThreshold;
  return { shouldAlert };
}

/**
 * Calcula o próximo estado de falhas consecutivas dado o resultado
 * atual. Helper pra concentrar a lógica de transição num só lugar
 * testável.
 *
 *   - outcome `ok`     → reset (0)
 *   - outcome `failed` → +1
 *   - outcome `pending`→ inalterado (sem informação nova)
 */
export function nextConsecutiveFailures(args: {
  current: number;
  outcome: HealthcheckOutcome;
}): number {
  if (args.outcome === "ok") return 0;
  if (args.outcome === "failed") return Math.max(0, args.current) + 1;
  return Math.max(0, args.current);
}

/** Defensivo: parseia int de string vinda do `runtime_config.value`. */
export function parseConfigInt(
  raw: string | null | undefined,
  fallback: number,
): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}
