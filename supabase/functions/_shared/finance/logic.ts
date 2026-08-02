// Helpers puros do dominio financeiro.
//
// Ficam fora do `index.ts` das funcoes por dois motivos: (1) o vitest so
// coleta testes em `supabase/functions/_shared/**`, e (2) modulos aqui nao
// importam VALOR de esm.sh, entao rodam no vitest sem baixar o SDK.
//
// Nada aqui altera regra financeira: `getNextRecurrenceDate` foi movida
// verbatim de `daily-finance-cron/index.ts` para poder ser coberta por teste.

export interface FinanceRequestOptions {
  /**
   * Modo de verificacao: autentica, resolve o conjunto de trabalho e
   * responde contagem/preview, sem NENHUMA escrita.
   *
   * Opt-in explicito (`{"validateOnly": true}`). Qualquer outro valor —
   * ausente, `"true"` string, null, body invalido — mantem a execucao real
   * exatamente como hoje. O default NAO pode inverter: cron e frontend em
   * producao chamam sem esse campo e precisam continuar executando.
   */
  validateOnly: boolean;
}

export function parseFinanceRequest(body: unknown): FinanceRequestOptions {
  const value = isRecord(body) ? body : {};
  return { validateOnly: value.validateOnly === true };
}

/**
 * Comparacao em tempo constante. Evita que a latencia da resposta vaze
 * quantos caracteres do segredo o atacante acertou.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;

  for (let i = 0; i < length; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }

  return diff === 0;
}

/**
 * A migration gera exatamente 64 caracteres hexadecimais. Validar o formato
 * antes de consultar o banco descarta chamada publica invalida sem I/O.
 */
export function isFinanceCronSecret(value: string): boolean {
  return FINANCE_CRON_SECRET_PATTERN.test(value);
}

/** Movida verbatim de `daily-finance-cron/index.ts`. Semantica inalterada. */
export function getNextRecurrenceDate(fromDate: Date, frequency: string): Date {
  const next = new Date(fromDate);
  switch (frequency) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const FINANCE_CRON_SECRET_PATTERN = /^[0-9a-f]{64}$/;
