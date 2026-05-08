// Retry helper puro pra chamadas EVO. Sem I/O, sem dependências do
// runtime Deno — testável em vitest.
//
// Convenção de mensagens de erro produzidas pelo caller (compatível
// com `is4xx(err)` existente em sync-evo-attendance):
//
//   `EVO_FETCH_FAILED: <reason>`        — falha de rede no fetch
//   `EVO_BODY_READ_FAILED: <reason>`    — erro lendo body (response.text)
//   `EVO_BODY_PARSE_FAILED: <reason>`   — JSON inválido em resposta 2xx
//   `EVO <status> <url>: <body>`        — HTTP non-2xx (preserva formato
//                                          atual usado por is4xx)

export const EVO_FETCH_FAILED_PREFIX = "EVO_FETCH_FAILED:";
export const EVO_BODY_READ_FAILED_PREFIX = "EVO_BODY_READ_FAILED:";
export const EVO_BODY_PARSE_FAILED_PREFIX = "EVO_BODY_PARSE_FAILED:";

export const DEFAULT_RETRY_ATTEMPTS = 3;
export const DEFAULT_BACKOFF_MS: readonly number[] = [500, 1500, 3500];

/**
 * Classifica se um erro é transitório (vale retry) ou fatal (4xx /
 * formato desconhecido). 4xx NÃO entram em retry — caller decide o
 * que fazer (no sync, alguns 4xx alimentam fallback v2→v1).
 */
export function isTransientError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? "";
  if (!msg) return false;

  if (msg.startsWith(EVO_FETCH_FAILED_PREFIX)) return true;
  if (msg.startsWith(EVO_BODY_READ_FAILED_PREFIX)) return true;
  if (msg.startsWith(EVO_BODY_PARSE_FAILED_PREFIX)) return true;

  const m = msg.match(/^EVO (\d{3})\b/);
  if (m) {
    const status = parseInt(m[1], 10);
    if (status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    return false; // 4xx é fatal pro retry (caller pode fazer fallback)
  }

  return false;
}

export interface WithRetryOptions {
  attempts: number;
  backoffMs: readonly number[];
  isTransient: (err: unknown) => boolean;
  /** Notificado a cada tentativa que falhou e ainda terá retry. */
  onAttemptFailed?: (attempt: number, err: unknown, waitMs: number) => void;
  /** Override de sleep — testes injetam função imediata pra não atrasar. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Executa `fn(attempt)` até `attempts` vezes. Aborta cedo se `isTransient`
 * disser não. Re-lança o último erro capturado se todas as tentativas
 * falharem (caller decide envoltório de mensagem final).
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: WithRetryOptions,
): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (!opts.isTransient(err)) throw err;
      if (attempt === opts.attempts - 1) break;
      const wait =
        opts.backoffMs[attempt] ??
        opts.backoffMs[opts.backoffMs.length - 1] ??
        0;
      opts.onAttemptFailed?.(attempt, err, wait);
      if (wait > 0) await sleep(wait);
    }
  }
  throw lastErr;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
