// Tipo canônico de uma transação de extrato OFX.
//
// CAUSA-RAIZ das 91 despesas-lixo de 04/03/2026 (Onda 2e): o parser
// classificava como DÉBITO tudo que não viesse com TRNTYPE exatamente
// "CREDIT". O padrão OFX, porém, tem dezenas de TRNTYPE (DEP, XFER,
// DIRECTDEP, INT, ATM, POS, FEE, SRVCHG…) e quem carrega o sentido do
// dinheiro é o SINAL do <TRNAMT>: positivo entra na conta, negativo sai.
// Resultado do bug: depósito em dinheiro (TRNTYPE=DEP, +10.000,00),
// PIX recebido, estorno e devolução de juros viraram DESPESA.
//
// Regra correta: o SINAL manda. O TRNTYPE cru vira insumo apenas no
// empate (valor zero) e fica preservado para diagnóstico.
//
// Escopo: só o extrato OFX de conta. Os parsers de CSV e de fatura de
// cartão já derivam o tipo do próprio sinal (o do cartão invertido, por
// convenção da fatura) e NÃO passam por aqui.

export type CanonicalTrnType = "CREDIT" | "DEBIT";

/** TRNTYPEs do padrão OFX que significam entrada de dinheiro. */
const CREDIT_RAW_TYPES = new Set([
  "CREDIT",
  "DEP",
  "DIRECTDEP",
  "INT",
  "DIV",
  "CASH",
]);

/**
 * Decide o tipo canônico de uma transação de conta.
 * @param rawTrnType TRNTYPE como veio no arquivo (pode ser qualquer coisa).
 * @param trnAmt valor com sinal, em reais, como veio no <TRNAMT>.
 */
export function canonicalOfxType(
  rawTrnType: string | null | undefined,
  trnAmt: number,
): CanonicalTrnType {
  if (Number.isFinite(trnAmt) && trnAmt !== 0) {
    return trnAmt > 0 ? "CREDIT" : "DEBIT";
  }
  // Valor zero ou inválido: cai no tipo declarado (default conservador
  // DEBIT só quando o banco não declarou nada de crédito).
  const raw = (rawTrnType ?? "").trim().toUpperCase();
  return CREDIT_RAW_TYPES.has(raw) ? "CREDIT" : "DEBIT";
}

/**
 * true quando o TRNTYPE declarado pelo banco contradiz o sinal — vale
 * log de observabilidade: é exatamente o padrão que produziu o lixo.
 */
export function ofxTypeDivergesFromSign(
  rawTrnType: string | null | undefined,
  trnAmt: number,
): boolean {
  if (!Number.isFinite(trnAmt) || trnAmt === 0) return false;
  const raw = (rawTrnType ?? "").trim().toUpperCase();
  if (raw.length === 0) return false;
  const declared: CanonicalTrnType = CREDIT_RAW_TYPES.has(raw) ? "CREDIT" : "DEBIT";
  return declared !== canonicalOfxType(rawTrnType, trnAmt);
}
