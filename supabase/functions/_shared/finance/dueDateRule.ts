// Regra de vencimento da Fabrik — fonte única.
//
// REGRA DE NEGÓCIO (ratificada pelo Alex em 05/08/2026):
//   "Não concentro pagamentos em dias fixos. Cada aluna tem o seu dia,
//    conforme o dia em que iniciou o contrato."
//
// Ou seja: o vencimento de todas as parcelas é o MESMO DIA DO MÊS —
// o `payment_day` do contrato (que por padrão é o dia do `start_date`).
//
// O que existia antes (e gerava vencimento errado): o gerador somava
// 30 DIAS por parcela. Uma aluna que fechou em 10/01 recebia parcelas em
// 10/01, 09/02, 11/03, 10/04… — o vencimento escorregava o ano inteiro;
// e quem fechava em 31/01 pulava fevereiro (31/01 + 30 = 02/03).
//
// Por que isto vive FORA do gerador: a regra é do negócio, não da
// automação. Ela serve para (a) o mandato de cobrança recorrente no
// processador de pagamento — Pix Automático/cartão — quando a cobrança
// vier para o app; (b) conferir se o EVO está cobrando no dia certo;
// (c) o gerador de faturas, enquanto existir.

/** Último dia do mês (1-12), tratando ano bissexto. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Dia de vencimento efetivo do contrato: o `payment_day` informado ou,
 * na ausência dele, o dia do início do contrato.
 */
export function resolvePaymentDay(
  startDateISO: string,
  paymentDay?: number | null,
): number {
  if (paymentDay && Number.isInteger(paymentDay) && paymentDay >= 1 && paymentDay <= 31) {
    return paymentDay;
  }
  const day = Number(startDateISO.substring(8, 10));
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`dueDateRule: start_date inválida ("${startDateISO}")`);
  }
  return day;
}

/**
 * Vencimento da parcela `installmentIndex` (0 = primeira), somando MESES
 * de calendário a partir do início do contrato e mantendo sempre o mesmo
 * dia. Quando o mês não tem o dia (31 em fevereiro), cai no ÚLTIMO DIA
 * do mês — mesma convenção de banco/débito automático: nunca pula mês,
 * nunca vaza para o mês seguinte.
 */
export function installmentDueDate(args: {
  startDateISO: string;
  paymentDay?: number | null;
  installmentIndex: number;
}): string {
  const { startDateISO, paymentDay, installmentIndex } = args;
  if (!Number.isInteger(installmentIndex) || installmentIndex < 0) {
    throw new Error(`dueDateRule: parcela inválida (${installmentIndex})`);
  }
  const day = resolvePaymentDay(startDateISO, paymentDay);

  const startYear = Number(startDateISO.substring(0, 4));
  const startMonth = Number(startDateISO.substring(5, 7)); // 1-12
  if (!Number.isInteger(startYear) || !Number.isInteger(startMonth)) {
    throw new Error(`dueDateRule: start_date inválida ("${startDateISO}")`);
  }

  // A 1ª parcela é a PRIMEIRA ocorrência do dia de vencimento a partir
  // do início do contrato — nunca antes dele (contrato assinado dia 25
  // com vencimento dia 10 começa em 10 do mês seguinte).
  const startDay = Number(startDateISO.substring(8, 10));
  const startsNextMonth = day < startDay ? 1 : 0;

  // Avança meses de CALENDÁRIO (não 30 dias).
  const zeroBased = startMonth - 1 + installmentIndex + startsNextMonth;
  const year = startYear + Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;

  const effectiveDay = Math.min(day, lastDayOfMonth(year, month));

  return `${year}-${String(month).padStart(2, "0")}-${String(effectiveDay).padStart(2, "0")}`;
}

/** Todas as datas de vencimento de um contrato parcelado. */
export function contractDueDates(args: {
  startDateISO: string;
  paymentDay?: number | null;
  installments: number;
}): string[] {
  const { startDateISO, paymentDay, installments } = args;
  if (!Number.isInteger(installments) || installments < 1) {
    throw new Error(`dueDateRule: número de parcelas inválido (${installments})`);
  }
  return Array.from({ length: installments }, (_, i) =>
    installmentDueDate({ startDateISO, paymentDay, installmentIndex: i }),
  );
}
