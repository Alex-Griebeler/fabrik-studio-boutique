// Parser de extrato OFX de conta — extraído da edge function para ficar
// testável de ponta a ponta (Onda 2e). Função pura: entra o texto do
// arquivo, sai o resultado normalizado. Sem dependência de Deno/rede.
//
// Regra central (a que corrigiu as 91 despesas-lixo): o `trnType` que
// sai daqui é SEMPRE canônico ("CREDIT"/"DEBIT"), derivado do sinal do
// <TRNAMT> — não é o rótulo cru do banco. Ver ofxTransactionType.ts.

import {
  canonicalOfxType,
  ofxTypeDivergesFromSign,
} from "./ofxTransactionType.ts";

export interface ParsedTransaction {
  /** Canônico: "CREDIT" | "DEBIT" (nunca o TRNTYPE cru). */
  trnType: string;
  dtPosted: string;
  trnAmt: number;
  fitId: string;
  memo: string;
}

export interface ParsedResult {
  bankId: string | null;
  accountId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  transactions: ParsedTransaction[];
}

export function parseOFX(raw: string): ParsedResult {
  const result: ParsedResult = {
    bankId: null, accountId: null, periodStart: null, periodEnd: null, transactions: [],
  };

  const bankIdMatch = raw.match(/<BANKID>([^\s<]+)/);
  const acctIdMatch = raw.match(/<ACCTID>([^\s<]+)/);
  result.bankId = bankIdMatch?.[1] ?? null;
  result.accountId = acctIdMatch?.[1] ?? null;
  const dtStartMatch = raw.match(/<DTSTART>(\d{8})/);
  const dtEndMatch = raw.match(/<DTEND>(\d{8})/);
  if (dtStartMatch) result.periodStart = fmtDate(dtStartMatch[1]);
  if (dtEndMatch) result.periodEnd = fmtDate(dtEndMatch[1]);

  const trnBlocks = raw.split("<STMTTRN>");
  for (let i = 1; i < trnBlocks.length; i++) {
    const block = trnBlocks[i];
    const endIdx = block.indexOf("</STMTTRN>");
    const content = endIdx !== -1 ? block.substring(0, endIdx) : block;
    const trnType = ef(content, "TRNTYPE");
    const dtPosted = ef(content, "DTPOSTED");
    const trnAmt = ef(content, "TRNAMT");
    const fitId = ef(content, "FITID");
    const memo = ef(content, "MEMO");
    if (trnType && dtPosted && trnAmt && fitId) {
      const amount = parseFloat(trnAmt.trim());
      // Valor ilegível descarta a linha: sem isto, Math.round(NaN) chega
      // ao insert e contamina a importação inteira.
      if (!Number.isFinite(amount)) {
        console.warn(
          `parseOFX: TRNAMT ilegível ("${trnAmt.trim()}") no fitId ${fitId.trim()} — transação descartada`,
        );
        continue;
      }
      const rawType = trnType.trim();
      const canonical = canonicalOfxType(rawType, amount);
      if (ofxTypeDivergesFromSign(rawType, amount)) {
        console.warn(
          `parseOFX: TRNTYPE "${rawType}" contradiz o sinal do valor — usando ${canonical} (fitId ${fitId.trim()})`,
        );
      }
      result.transactions.push({
        trnType: canonical,
        dtPosted: fmtDate(dtPosted.trim().substring(0, 8)),
        trnAmt: amount,
        fitId: fitId.trim(),
        memo: (memo ?? "").trim(),
      });
    }
  }
  return result;
}

export function ef(block: string, field: string): string | null {
  const m = block.match(new RegExp(`<${field}>([^<\\n]+)`, "i"));
  return m ? m[1] : null;
}

export function fmtDate(d: string): string {
  return `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
}
