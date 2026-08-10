// Handler do `parse-bank-statement`.
//
// Onda 2c-1: extraído para `_shared/` no mesmo padrão do matcher — sem import
// de VALOR do SDK nem da lib XLSX (ambos entram por injeção), então o vitest
// cobre o handler inteiro: auth, contrato, carimbo de versão do parser e,
// principalmente, a AUSÊNCIA da fábrica de despesas.
//
// Duas mudanças de comportamento nesta onda (D4 e D8 do plano 2c v5):
//  1. Débito importado NÃO vira mais despesa automática. Era a fonte de 60
//     das 91 despesas-lixo: cada débito nascia como expense `paid` sem dedupe
//     nem FK, duplicando a fatura de cartão lançada à mão. A criação de
//     despesa a partir de débito volta na 2c-3 como ação explícita por RPC
//     transacional (1 clique, com vínculo e dedupe estrutural).
//  2. Toda importação carrega `parser_version`. O default da coluna é
//     'unknown' (não-confiável); SÓ este handler grava versão real. As RPCs
//     de conciliação das PRs seguintes aceitam versões por allowlist.

import {
  parseOFX,
  type ParsedResult,
} from "./parseOfx.ts";
import {
  isBankRequestError,
  parseBankStatementRequest,
  requestTooLarge,
  requireBankStaff,
  type BankDependencies,
} from "./bankAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Versão declarada por formato. Versionar POR FORMATO importa: o OFX foi
 * consertado na 2e (sinal do TRNAMT manda) e é candidato a allowlist; os
 * parsers de CSV/XLSX (fatura de cartão, ano inferido por heurística, sem
 * identidade de conta) nunca passaram por auditoria equivalente — a allowlist
 * da 2c-3 decide formato a formato, sem precisar de nova migration.
 */
export const PARSER_VERSIONS = {
  ofx: "ofx-v2",
  csv: "csv-v1",
  xlsx: "xlsx-v1",
  xls: "xlsx-v1",
} as const;

export type XlsxCell = string | number | null;

export interface ParseBankStatementDependencies extends BankDependencies {
  /**
   * Decodifica um XLSX (bytes) na matriz de células da primeira planilha.
   * Injetado porque a lib XLSX vem de esm.sh no Deno — import de URL que o
   * vitest não resolve. O wrapper `index.ts` liga na lib real.
   */
  xlsxToRows: (bytes: Uint8Array) => { sheetName: string | null; rows: XlsxCell[][] };
}

// ── CSV Parser ──

function parseCSV(raw: string): ParsedResult {
  const result: ParsedResult = {
    bankId: null, accountId: null, periodStart: null, periodEnd: null, transactions: [],
  };

  // Split lines and remove empty
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return result;

  // Detect separator (semicolon or comma)
  const sep = lines[0].includes(";") ? ";" : ",";

  // Parse header to find column indices
  const headerRaw = lines[0].split(sep).map((h) => h.replace(/"/g, "").trim().toLowerCase());

  // Map common column names from Brazilian banks
  const dateAliases = ["data", "data lançamento", "data lancamento", "data movimentação", "data mov", "date", "dt_lancamento"];
  const descAliases = ["histórico", "historico", "descrição", "descricao", "memo", "description", "lançamento", "lancamento", "extrato"];
  const amountAliases = ["valor", "value", "amount", "vl_transacao"];
  const creditAliases = ["crédito", "credito", "credit", "entrada"];
  const debitAliases = ["débito", "debito", "debit", "saída", "saida"];

  const find = (aliases: string[]) => headerRaw.findIndex((h) => aliases.some((a) => h.includes(a)));

  const dateIdx = find(dateAliases);
  const descIdx = find(descAliases);
  const amountIdx = find(amountAliases);
  const creditIdx = find(creditAliases);
  const debitIdx = find(debitAliases);

  if (dateIdx === -1) return result; // Must have a date column

  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i], sep);
    if (cols.length <= dateIdx) continue;

    const rawDate = cols[dateIdx]?.replace(/"/g, "").trim();
    const postedDate = normalizeDate(rawDate);
    if (!postedDate) continue;

    // Track period
    if (!minDate || postedDate < minDate) minDate = postedDate;
    if (!maxDate || postedDate > maxDate) maxDate = postedDate;

    const memo = descIdx >= 0 ? (cols[descIdx]?.replace(/"/g, "").trim() ?? "") : "";

    let amount = 0;
    if (amountIdx >= 0) {
      amount = parseBRNumber(cols[amountIdx]);
    } else if (creditIdx >= 0 && debitIdx >= 0) {
      const credit = parseBRNumber(cols[creditIdx]);
      const debit = parseBRNumber(cols[debitIdx]);
      amount = credit !== 0 ? Math.abs(credit) : -Math.abs(debit);
    }

    if (amount === 0) continue;

    const trnType = amount > 0 ? "CREDIT" : "DEBIT";
    const fitId = `csv_${postedDate}_${i}_${Math.abs(Math.round(amount * 100))}`;

    result.transactions.push({ trnType, dtPosted: postedDate, trnAmt: amount, fitId, memo });
  }

  result.periodStart = minDate;
  result.periodEnd = maxDate;
  return result;
}

function splitCSVLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === sep && !inQuotes) { result.push(current); current = ""; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

function normalizeDate(raw: string): string | null {
  // dd/mm/yyyy or dd-mm-yyyy
  const brMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // yyyy-mm-dd
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return raw;
  return null;
}

function parseBRNumber(raw: string | undefined): number {
  if (!raw) return 0;
  let s = raw.replace(/"/g, "").trim();
  if (!s) return 0;
  // Brazilian format: 1.234,56 → remove dots, replace comma with dot
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ── XLSX Parser ──

const MONTH_ABBR: Record<string, string> = {
  jan: "01", fev: "02", feb: "02", mar: "03", abr: "04", apr: "04",
  mai: "05", may: "05", jun: "06", jul: "07", ago: "08", aug: "08",
  set: "09", sep: "09", out: "10", oct: "10", nov: "11", dez: "12", dec: "12",
};

function parseXLSXDate(cell: XlsxCell): { dd: string; mm: string; year: number | null } | null {
  if (cell === null || cell === undefined) return null;

  // Excel serial date
  if (typeof cell === "number" && cell > 40000) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + cell * 86400000);
    return { dd: String(date.getDate()), mm: String(date.getMonth() + 1), year: date.getFullYear() };
  }

  const s = String(cell).trim();

  // dd/mm/yyyy
  const full = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (full) return { dd: full[1], mm: full[2], year: parseInt(full[3]) };

  // dd/mm (short numeric)
  const shortNum = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (shortNum) return { dd: shortNum[1], mm: shortNum[2], year: null };

  // dd/Mon or dd/Mon (month abbreviation like 19/Mar, 04/Aug)
  const abbr = s.match(/^(\d{1,2})[/-]([A-Za-zçã]+)$/i);
  if (abbr) {
    const monthKey = abbr[2].toLowerCase().substring(0, 3);
    const mm = MONTH_ABBR[monthKey];
    if (mm) return { dd: abbr[1], mm, year: null };
  }

  return null;
}

function parseXLSX(
  base64Content: string,
  xlsxToRows: ParseBankStatementDependencies["xlsxToRows"],
): ParsedResult {
  const result: ParsedResult = {
    bankId: null, accountId: null, periodStart: null, periodEnd: null, transactions: [],
  };

  const binaryStr = atob(base64Content);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const { sheetName, rows } = xlsxToRows(bytes);
  if (!sheetName || rows.length === 0) return result;

  // Conteudo bruto do extrato (nomes, CPF/CNPJ, valores) nao vai para o log.
  console.log(`XLSX: Total rows = ${rows.length}, sheet = ${sheetName}`);

  // Extract metadata
  let vencimento: string | null = null;
  let bankDetected: string | null = null;

  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const rowStr = row.map(c => String(c ?? "").toLowerCase()).join(" ");

    if (rowStr.includes("itau") || rowStr.includes("itaú")) bankDetected = "ITAU";
    else if (rowStr.includes("banco do brasil") || rowStr.includes("ourocard")) bankDetected = "BB";

    // Look for agência/conta
    const agMatch = rowStr.match(/ag[eê]ncia\s*\/?\s*conta[:\s]*(\S+)/);
    if (agMatch) result.accountId = agMatch[1];

    // Look for card number patterns
    const cardMatch = rowStr.match(/(\d{4}[.*xX]+[.*xX\d]+\d{4})/);
    if (cardMatch && !result.accountId) result.accountId = cardMatch[1];

    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] ?? "").trim().toLowerCase();
      if (cellVal.includes("vencimento")) {
        // Check next cell or next-next cell for the date
        for (let nc = c + 1; nc < Math.min(c + 3, row.length); nc++) {
          const nextVal = String(row[nc] ?? "").trim();
          if (nextVal && nextVal !== "null") {
            vencimento = nextVal;
            break;
          }
        }
        // Also check the row below
        if (!vencimento && i + 1 < rows.length) {
          const belowRow = rows[i + 1];
          if (belowRow) {
            for (let nc = c; nc < Math.min(c + 2, belowRow.length); nc++) {
              const belowVal = String(belowRow[nc] ?? "").trim();
              if (belowVal && belowVal !== "null" && belowVal.match(/\d/)) {
                vencimento = belowVal;
                break;
              }
            }
          }
        }
        if (vencimento) console.log(`Found vencimento: ${vencimento}`);
      }
    }
  }

  // Determine base year from vencimento
  let baseYear = new Date().getFullYear();
  let vencMonth = 0;
  if (vencimento) {
    const parsed = parseXLSXDate(vencimento);
    if (parsed && parsed.year) {
      baseYear = parsed.year;
      vencMonth = parseInt(parsed.mm);
      result.periodEnd = `${baseYear}-${parsed.mm.padStart(2, "0")}-${parsed.dd.padStart(2, "0")}`;
    } else {
      // Try dd/mm/yyyy in string
      const match = vencimento.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
      if (match) {
        baseYear = parseInt(match[3]);
        vencMonth = parseInt(match[2]);
        result.periodEnd = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
      }
    }
    console.log(`Base year: ${baseYear}, venc month: ${vencMonth}`);
  }

  let minDate: string | null = null;
  let maxDate: string | null = null;
  let txCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const dateInfo = parseXLSXDate(row[0]);
    if (!dateInfo) continue;

    // Find description - search non-numeric text columns
    let descCell = "";
    for (let c = 1; c < row.length; c++) {
      const val = String(row[c] ?? "").trim();
      if (!val || val === "null") continue;
      // Skip currency labels and pure numbers
      if (val === "R$" || val === "US$" || val === "BRL") continue;
      if (val.match(/^-?\d[\d.,]*$/)) continue;
      // Skip very short strings that look like currency codes
      if (val.length <= 3 && val.match(/^[A-Z$]/)) continue;
      descCell = val;
      break;
    }
    if (!descCell) continue;

    // Skip totals, subtotals, headers
    const descUpper = descCell.toUpperCase();
    if (descUpper.includes("SUBTOTAL") || descUpper.startsWith("TOTAL")) continue;
    if (descUpper.includes("SALDO FATURA") || descUpper.includes("SALDO DA FATURA")) continue;
    if (descUpper === "DATA" || descUpper === "DESCRIÇÃO" || descUpper === "DESCRICAO") continue;
    if (descUpper.includes("REPASSE DE IOF")) continue;

    // Calculate year
    const month = parseInt(dateInfo.mm);
    let year = dateInfo.year ?? baseYear;
    if (!dateInfo.year && vencMonth > 0 && month > vencMonth) {
      year = baseYear - 1;
    }
    const postedDate = `${year}-${String(month).padStart(2, "0")}-${String(parseInt(dateInfo.dd)).padStart(2, "0")}`;

    // Find amount - scan from the end for the last numeric value
    let amount = 0;
    for (let c = row.length - 1; c >= 1; c--) {
      const cell = row[c];
      if (cell === null || cell === undefined) continue;
      const cellStr = String(cell).trim();
      if (!cellStr || cellStr === "null" || cellStr === "0" || cellStr === "0,00") continue;
      if (cellStr === "R$" || cellStr === "US$" || cellStr === "BRL") continue;
      const val = typeof cell === "number" ? cell : parseBRNumber(cellStr);
      if (val !== 0) { amount = val; break; }
    }

    if (amount === 0) continue;

    if (!minDate || postedDate < minDate) minDate = postedDate;
    if (!maxDate || postedDate > maxDate) maxDate = postedDate;

    // Credit card: positive = expense (debit), negative = payment/credit
    const trnType = amount < 0 ? "CREDIT" : "DEBIT";
    const fitId = `xlsx_${postedDate}_${i}_${Math.abs(Math.round(amount * 100))}`;

    result.transactions.push({ trnType, dtPosted: postedDate, trnAmt: amount, fitId, memo: descCell });
    txCount++;
  }

  console.log(`XLSX parsed: ${txCount} transactions, period ${minDate} to ${maxDate}`);

  result.periodStart = minDate ?? result.periodStart;
  result.periodEnd = maxDate ?? result.periodEnd;
  result.bankId = bankDetected ?? "UNKNOWN";
  return result;
}

interface ParsedInfo {
  type: string; name: string | null; document: string | null; isBalance: boolean;
}

function classify(memo: string, trnType: string): ParsedInfo {
  const u = memo.toUpperCase();
  if (u.includes("SALDO TOTAL DISPONÍVEL") || u.includes("SALDO EM CONTA"))
    return { type: "balance", name: null, document: null, isBalance: true };

  const cpf = memo.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/);
  const cnpj = memo.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
  const doc = cpf?.[1] ?? cnpj?.[1] ?? null;

  if (u.includes("REND PAGO APLIC") || u.includes("RENDIMENTOS"))
    return { type: "investment_return", name: null, document: doc, isBalance: false };
  if (u.includes("PIX RECEBIDO"))
    return { type: "pix_received", name: extractName(memo, "PIX RECEBIDO"), document: doc, isBalance: false };
  if (u.includes("PIX ENVIADO"))
    return { type: "pix_sent", name: extractName(memo, "PIX ENVIADO"), document: doc, isBalance: false };
  if (u.includes("RECEBIMENTO REDE")) {
    let st = "card_received";
    if (u.includes("VISA AT")) st = "card_visa_debit";
    else if (u.includes("VISA CD")) st = "card_visa_credit";
    else if (u.includes("MAST AT")) st = "card_master_debit";
    else if (u.includes("MAST CD")) st = "card_master_credit";
    return { type: st, name: "Rede (cartão)", document: doc, isBalance: false };
  }
  if (u.includes("BOLETO PAGO")) {
    const after = memo.substring(u.indexOf("BOLETO PAGO") + 11).trim();
    const name = after.replace(/\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s*$/, "").replace(/\s*\d{3}\.\d{3}\.\d{3}-\d{2}\s*$/, "").trim();
    return { type: "boleto_paid", name: name || null, document: doc, isBalance: false };
  }
  if (u.includes("CONCESSIONARIA")) {
    const after = memo.substring(u.indexOf("CONCESSIONARIA") + 14).trim();
    const name = after.replace(/\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s*$/, "").trim();
    return { type: "utility_paid", name: name || null, document: doc, isBalance: false };
  }
  if (trnType === "CREDIT")
    return { type: "other_credit", name: null, document: doc, isBalance: false };
  return { type: "other_debit", name: null, document: doc, isBalance: false };
}

function extractName(memo: string, prefix: string): string | null {
  const after = memo.substring(memo.toUpperCase().indexOf(prefix) + prefix.length).trim();
  const cleaned = after.replace(/\s*\d{3}\.\d{3}\.\d{3}-\d{2}\s*$/, "").replace(/\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s*$/, "").trim();
  return cleaned || null;
}

export async function handleParseBankStatement(
  req: Request,
  deps: ParseBankStatementDependencies,
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Fail-closed: exige JWT de staff admin ANTES de ler o corpo e antes do
    // parser pesado.
    const auth = await requireBankStaff(req, deps);
    if (auth instanceof Response) return auth;

    const supabase = auth.adminClient;
    const importedBy = auth.userId;

    // Teto antes de materializar o JSON: o limite por campo so pode agir
    // depois do parse, e o parse ja custa a memoria que queremos poupar.
    if (requestTooLarge(req)) {
      return json({ error: "Arquivo excede o tamanho máximo suportado" }, 413);
    }

    const request = parseBankStatementRequest(await req.json().catch(() => null));
    if (isBankRequestError(request)) {
      return json({ error: request.error }, request.status);
    }
    const { fileContent, fileName, fileType, forceImport } = request;

    let parsed: ParsedResult;
    if (fileType === "ofx") parsed = parseOFX(fileContent);
    else if (fileType === "csv") parsed = parseCSV(fileContent);
    else parsed = parseXLSX(fileContent, deps.xlsxToRows);

    // Calculate file hash for duplicate detection
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(fileContent));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // Check for duplicate import
    if (!forceImport) {
      const { data: existingImport } = await supabase
        .from("bank_imports")
        .select("id, file_name, created_at")
        .eq("file_hash", fileHash)
        .eq("status", "completed")
        .limit(1);

      if (existingImport && existingImport.length > 0) {
        return json({
          error: "Arquivo duplicado",
          details: `Este arquivo já foi importado em ${existingImport[0].created_at} (${existingImport[0].file_name})`,
        }, 409);
      }
    }

    const { data: importRec, error: impErr } = await supabase.from("bank_imports").insert({
      file_name: fileName, file_type: fileType,
      bank_id: parsed.bankId, account_id: parsed.accountId,
      period_start: parsed.periodStart, period_end: parsed.periodEnd,
      status: "processing", imported_by: importedBy,
      file_hash: fileHash,
      // D8: só este handler declara versão real; qualquer outro caminho de
      // escrita cai no default 'unknown' e fica fora da allowlist da 2c.
      parser_version: PARSER_VERSIONS[fileType],
    }).select().single();

    if (impErr) {
      console.error("parse-bank-statement: import insert failed", impErr.message);
      return json({ error: "Erro ao criar importação" }, 500);
    }

    const txns = parsed.transactions.map((t) => {
      const c = classify(t.memo, t.trnType);
      return {
        import_id: importRec.id, fit_id: t.fitId,
        transaction_type: t.trnType === "CREDIT" ? "credit" : "debit",
        posted_date: t.dtPosted, amount_cents: Math.round(t.trnAmt * 100),
        memo: t.memo, parsed_type: c.type, parsed_name: c.name,
        parsed_document: c.document, is_balance_entry: c.isBalance,
      };
    });

    const valid = txns.filter((t) => !t.is_balance_entry);
    let count = 0;
    if (valid.length > 0) {
      const { error: tErr, data: ins } = await supabase.from("bank_transactions").insert(valid).select("id");
      if (tErr) {
        await supabase.from("bank_imports").update({ status: "failed", error_message: tErr.message }).eq("id", importRec.id);
        console.error("parse-bank-statement: tx insert failed", tErr.message);
        return json({ error: "Erro ao inserir transações" }, 500);
      }
      count = ins?.length ?? 0;
    }

    const totalCredits = valid.filter((t) => t.transaction_type === "credit").reduce((s, t) => s + t.amount_cents, 0);
    const totalDebits = valid.filter((t) => t.transaction_type === "debit").reduce((s, t) => s + Math.abs(t.amount_cents), 0);

    // A fábrica de despesas que vivia aqui (todo débito → expense `paid`
    // automática) foi REMOVIDA na 2c-1. Ver o cabeçalho do arquivo.

    // O erro deste update era ignorado. Ele importa: a dedupe por hash so
    // considera importacao `completed`, entao uma que ficou presa em
    // `processing` nao bloqueia reenvio do mesmo arquivo — e o reenvio
    // duplicaria as transacoes ja inseridas. Responder 500 aqui seria pior,
    // porque induziria exatamente esse reenvio; o certo e devolver 200 (os
    // dados FORAM gravados) sinalizando que a importacao nao foi finalizada.
    const { error: finalizeErr } = await supabase.from("bank_imports").update({
      status: "completed", total_transactions: count,
      total_credits_cents: totalCredits, total_debits_cents: totalDebits,
    }).eq("id", importRec.id);

    if (finalizeErr) {
      console.error(
        "parse-bank-statement: importação", importRec.id,
        "ficou sem finalizar; transações já gravadas",
        finalizeErr.message,
      );
    }

    return json({
      success: true, import_id: importRec.id, finalized: !finalizeErr,
      summary: { total_transactions: count, skipped_balance_entries: txns.length - valid.length, total_credits: totalCredits, total_debits: totalDebits, bank: parsed.bankId, account: parsed.accountId, period: { start: parsed.periodStart, end: parsed.periodEnd } },
    });
  } catch (error) {
    console.error("Error:", error);
    console.error("parse-bank-statement fatal:", error instanceof Error ? error.message : error);
    return json({ error: "Erro inesperado" }, 500);
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
