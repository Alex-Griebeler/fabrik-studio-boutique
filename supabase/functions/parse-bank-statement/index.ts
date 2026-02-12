import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ParsedTransaction {
  trnType: string;
  dtPosted: string;
  trnAmt: number;
  fitId: string;
  memo: string;
}

interface ParsedResult {
  bankId: string | null;
  accountId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  transactions: ParsedTransaction[];
}

// ── OFX Parser ──

function parseOFX(raw: string): ParsedResult {
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
      result.transactions.push({
        trnType: trnType.trim(),
        dtPosted: fmtDate(dtPosted.trim().substring(0, 8)),
        trnAmt: parseFloat(trnAmt.trim()),
        fitId: fitId.trim(),
        memo: (memo ?? "").trim(),
      });
    }
  }
  return result;
}

function ef(block: string, field: string): string | null {
  const m = block.match(new RegExp(`<${field}>([^<\\n]+)`, "i"));
  return m ? m[1] : null;
}

function fmtDate(d: string): string {
  return `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
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
  const brMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
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

function parseXLSX(base64Content: string): ParsedResult {
  const result: ParsedResult = {
    bankId: null, accountId: null, periodStart: null, periodEnd: null, transactions: [],
  };

  // Decode base64 to binary
  const binaryStr = atob(base64Content);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const workbook = XLSX.read(bytes, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return result;

  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  console.log(`XLSX: Total rows = ${rows.length}, sheet = ${workbook.SheetNames[0]}`);
  // Log first 15 rows for debugging
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    console.log(`Row ${i}: ${JSON.stringify(rows[i])}`);
  }

  // Extract metadata from header rows
  let vencimento: string | null = null;
  let dataStartRow = -1;

  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    // Check all cells in the row for metadata
    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] ?? "").trim().toLowerCase();
      const nextCell = String(row[c + 1] ?? "").trim();
      
      if ((cellVal.includes("cartao") || cellVal.includes("cartão")) && nextCell) {
        result.accountId = nextCell;
      }
      if (cellVal.includes("vencimento") && nextCell) {
        vencimento = nextCell;
        console.log(`Found vencimento: ${vencimento}`);
      }
      if (cellVal.includes("centro de custo") && nextCell) {
        result.accountId = result.accountId || nextCell;
      }
    }
    
    // Find the header row - look for "Data" in any cell
    const firstCell = String(row[0] ?? "").trim().toLowerCase();
    const secondCell = String(row[1] ?? "").trim().toLowerCase();
    
    if (firstCell === "data" && (secondCell.includes("lancamento") || secondCell.includes("lançamento"))) {
      dataStartRow = i + 1;
      console.log(`Found header row at ${i}, data starts at ${dataStartRow}`);
    }
  }

  if (dataStartRow === -1) {
    // Fallback: scan for first row with dd/mm date pattern
    console.log("No header row found, scanning for date patterns...");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const firstCell = String(row[0] ?? "").trim();
      if (firstCell.match(/^\d{1,2}\/\d{1,2}$/)) {
        dataStartRow = i;
        console.log(`Fallback: found first date at row ${i}`);
        break;
      }
    }
    if (dataStartRow === -1) dataStartRow = 0;
  }

  // Determine the year from vencimento (e.g., "28/01/2026" → 2026)
  let baseYear = new Date().getFullYear();
  let vencMonth = 0;
  if (vencimento) {
    // Try dd/mm/yyyy format
    let match = vencimento.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (!match) {
      // Try Excel serial date or other formats
      const num = parseFloat(vencimento);
      if (!isNaN(num) && num > 40000) {
        // Excel serial date
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + num * 86400000);
        baseYear = date.getFullYear();
        vencMonth = date.getMonth() + 1;
        result.periodEnd = `${baseYear}-${String(vencMonth).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        console.log(`Vencimento from serial: ${result.periodEnd}`);
      }
    } else {
      baseYear = parseInt(match[3]);
      vencMonth = parseInt(match[2]);
      result.periodEnd = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
      console.log(`Vencimento parsed: ${result.periodEnd}`);
    }
  }

  let minDate: string | null = null;
  let maxDate: string | null = null;
  let txCount = 0;
  let skippedCount = 0;

  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const dateCell = String(row[0] ?? "").trim();
    
    // Check for date pattern - support dd/mm and dd/mm/yyyy
    let dd: string, mm: string, yearFromDate: number | null = null;
    const fullDateMatch = dateCell.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const shortDateMatch = dateCell.match(/^(\d{1,2})\/(\d{1,2})$/);
    
    if (fullDateMatch) {
      dd = fullDateMatch[1];
      mm = fullDateMatch[2];
      yearFromDate = parseInt(fullDateMatch[3]);
    } else if (shortDateMatch) {
      dd = shortDateMatch[1];
      mm = shortDateMatch[2];
    } else {
      // Also check if cell is a number (Excel serial date)
      const numVal = typeof row[0] === "number" ? row[0] : null;
      if (numVal && numVal > 40000) {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + numVal * 86400000);
        dd = String(date.getDate());
        mm = String(date.getMonth() + 1);
        yearFromDate = date.getFullYear();
      } else {
        continue; // Skip non-date rows
      }
    }
    
    // Find description - check columns 1 and beyond
    let descCell = "";
    for (let c = 1; c < Math.min(row.length, 4); c++) {
      const val = String(row[c] ?? "").trim();
      if (val && val !== "R$" && val !== "US$" && !val.match(/^-?\d/)) {
        descCell = val;
        break;
      }
    }
    if (!descCell) {
      skippedCount++;
      continue;
    }

    // Skip subtotals and totals
    const descUpper = descCell.toUpperCase();
    if (descUpper.includes("SUBTOTAL") || descUpper === "TOTAL") continue;
    if (descUpper.includes("SALDO FATURA")) continue;

    // Calculate year
    const month = parseInt(mm);
    const day = parseInt(dd);
    let year = yearFromDate ?? baseYear;
    if (!yearFromDate && vencMonth > 0 && month > vencMonth) {
      year = baseYear - 1;
    }
    const postedDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    // Find the value - check all columns from col 2 onwards
    let amount = 0;
    for (let c = 2; c < (row.length ?? 0); c++) {
      const cell = row[c];
      if (cell === null || cell === undefined) continue;
      const cellStr = String(cell).trim();
      if (cellStr === "R$" || cellStr === "US$" || cellStr === "" || cellStr === "0,00") continue;
      const val = typeof cell === "number" ? cell : parseBRNumber(cellStr);
      if (val !== 0) { amount = val; break; }
    }

    if (amount === 0) {
      skippedCount++;
      continue;
    }

    if (!minDate || postedDate < minDate) minDate = postedDate;
    if (!maxDate || postedDate > maxDate) maxDate = postedDate;

    // Credit card statements: positive = expense (debit), negative = payment/credit
    const trnType = amount < 0 ? "CREDIT" : "DEBIT";
    const fitId = `xlsx_${postedDate}_${i}_${Math.abs(Math.round(amount * 100))}`;

    result.transactions.push({ trnType, dtPosted: postedDate, trnAmt: amount, fitId, memo: descCell });
    txCount++;
  }

  console.log(`XLSX parsed: ${txCount} transactions, ${skippedCount} skipped, period ${minDate} to ${maxDate}`);

  result.periodStart = minDate ?? result.periodStart;
  result.periodEnd = maxDate ?? result.periodEnd;
  result.bankId = "BB";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey;
    const { data: { user }, error: authErr } = await createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    }).auth.getUser();

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fileContent, fileName, fileType } = await req.json();
    if (!fileContent || !fileName)
      return new Response(JSON.stringify({ error: "Arquivo obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    if (fileType !== "ofx" && fileType !== "csv" && fileType !== "xlsx" && fileType !== "xls")
      return new Response(JSON.stringify({ error: "Formato não suportado. Use OFX, CSV ou Excel." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    let parsed: ParsedResult;
    if (fileType === "ofx") parsed = parseOFX(fileContent);
    else if (fileType === "csv") parsed = parseCSV(fileContent);
    else parsed = parseXLSX(fileContent);

    const { data: importRec, error: impErr } = await supabase.from("bank_imports").insert({
      file_name: fileName, file_type: fileType,
      bank_id: parsed.bankId, account_id: parsed.accountId,
      period_start: parsed.periodStart, period_end: parsed.periodEnd,
      status: "processing", imported_by: user.id,
    }).select().single();

    if (impErr) {
      return new Response(JSON.stringify({ error: "Erro ao criar importação", details: impErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        return new Response(JSON.stringify({ error: "Erro ao inserir transações", details: tErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      count = ins?.length ?? 0;
    }

    const totalCredits = valid.filter((t) => t.transaction_type === "credit").reduce((s, t) => s + t.amount_cents, 0);
    const totalDebits = valid.filter((t) => t.transaction_type === "debit").reduce((s, t) => s + Math.abs(t.amount_cents), 0);

    await supabase.from("bank_imports").update({
      status: "completed", total_transactions: count,
      total_credits_cents: totalCredits, total_debits_cents: totalDebits,
    }).eq("id", importRec.id);

    return new Response(JSON.stringify({
      success: true, import_id: importRec.id,
      summary: { total_transactions: count, skipped_balance_entries: txns.length - valid.length, total_credits: totalCredits, total_debits: totalDebits, bank: parsed.bankId, account: parsed.accountId, period: { start: parsed.periodStart, end: parsed.periodEnd } },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Erro inesperado", details: error instanceof Error ? error.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
