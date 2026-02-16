import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

const MONTH_ABBR: Record<string, string> = {
  jan: "01", fev: "02", feb: "02", mar: "03", abr: "04", apr: "04",
  mai: "05", may: "05", jun: "06", jul: "07", ago: "08", aug: "08",
  set: "09", sep: "09", out: "10", oct: "10", nov: "11", dez: "12", dec: "12",
};

function parseXLSXDate(cell: string | number | null): { dd: string; mm: string; year: number | null } | null {
  if (cell === null || cell === undefined) return null;

  // Excel serial date
  if (typeof cell === "number" && cell > 40000) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + cell * 86400000);
    return { dd: String(date.getDate()), mm: String(date.getMonth() + 1), year: date.getFullYear() };
  }

  const s = String(cell).trim();

  // dd/mm/yyyy
  const full = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (full) return { dd: full[1], mm: full[2], year: parseInt(full[3]) };

  // dd/mm (short numeric)
  const shortNum = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (shortNum) return { dd: shortNum[1], mm: shortNum[2], year: null };

  // dd/Mon or dd/Mon (month abbreviation like 19/Mar, 04/Aug)
  const abbr = s.match(/^(\d{1,2})[\/\-]([A-Za-zçã]+)$/i);
  if (abbr) {
    const monthKey = abbr[2].toLowerCase().substring(0, 3);
    const mm = MONTH_ABBR[monthKey];
    if (mm) return { dd: abbr[1], mm, year: null };
  }

  return null;
}

function parseXLSX(base64Content: string): ParsedResult {
  const result: ParsedResult = {
    bankId: null, accountId: null, periodStart: null, periodEnd: null, transactions: [],
  };

  const binaryStr = atob(base64Content);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const workbook = XLSX.read(bytes, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return result;

  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  console.log(`XLSX: Total rows = ${rows.length}, sheet = ${workbook.SheetNames[0]}`);
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    console.log(`Row ${i}: ${JSON.stringify(rows[i])}`);
  }

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
    const cardMatch = rowStr.match(/(\d{4}[\.\*xX]+[\.\*xX\d]+\d{4})/);
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
      const match = vencimento.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
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

    // Calculate file hash for duplicate detection
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(fileContent));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // Check for duplicate import
    const { data: existingImport } = await supabase
      .from("bank_imports")
      .select("id, file_name, created_at")
      .eq("file_hash", fileHash)
      .eq("status", "completed")
      .limit(1);

    if (existingImport && existingImport.length > 0) {
      return new Response(JSON.stringify({
        error: "Arquivo duplicado",
        details: `Este arquivo já foi importado em ${existingImport[0].created_at} (${existingImport[0].file_name})`,
      }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: importRec, error: impErr } = await supabase.from("bank_imports").insert({
      file_name: fileName, file_type: fileType,
      bank_id: parsed.bankId, account_id: parsed.accountId,
      period_start: parsed.periodStart, period_end: parsed.periodEnd,
      status: "processing", imported_by: user.id,
      file_hash: fileHash,
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

    // ── Auto-create expenses from DEBIT transactions ──
    let expensesCreated = 0;
    const debitTxns = valid.filter((t) => t.transaction_type === "debit");
    if (debitTxns.length > 0) {
      // Fetch category rules
      const { data: rules } = await supabase
        .from("expense_category_rules")
        .select("keyword, category_id, priority")
        .eq("is_active", true)
        .order("priority", { ascending: false });

      // Fetch a default category (first active one) as fallback
      const { data: defaultCats } = await supabase
        .from("expense_categories")
        .select("id")
        .eq("is_active", true)
        .eq("slug", "geral")
        .limit(1);

      let defaultCategoryId = defaultCats?.[0]?.id;
      if (!defaultCategoryId) {
        // If no "geral" category, get any active category
        const { data: anyCat } = await supabase
          .from("expense_categories")
          .select("id")
          .eq("is_active", true)
          .order("sort_order")
          .limit(1);
        defaultCategoryId = anyCat?.[0]?.id;
      }

      if (defaultCategoryId) {
        const expensesToInsert = debitTxns.map((tx) => {
          // Find matching rule by keyword in memo
          let categoryId = defaultCategoryId!;
          if (rules && rules.length > 0) {
            const memoUpper = tx.memo.toUpperCase();
            for (const rule of rules) {
              if (memoUpper.includes(rule.keyword.toUpperCase())) {
                categoryId = rule.category_id;
                break;
              }
            }
          }

          return {
            category_id: categoryId,
            description: tx.memo,
            amount_cents: Math.abs(tx.amount_cents),
            due_date: tx.posted_date,
            payment_date: tx.posted_date,
            status: "paid" as const,
            notes: `Auto-criada da importação bancária (${fileName})`,
          };
        });

        const { data: createdExpenses, error: expErr } = await supabase
          .from("expenses")
          .insert(expensesToInsert)
          .select("id");

        if (!expErr && createdExpenses) {
          expensesCreated = createdExpenses.length;
          console.log(`Auto-created ${expensesCreated} expenses from ${debitTxns.length} debit transactions`);
        } else if (expErr) {
          console.error(`Error creating expenses: ${expErr.message}`);
        }
      }
    }

    await supabase.from("bank_imports").update({
      status: "completed", total_transactions: count,
      total_credits_cents: totalCredits, total_debits_cents: totalDebits,
    }).eq("id", importRec.id);

    return new Response(JSON.stringify({
      success: true, import_id: importRec.id,
      summary: { total_transactions: count, skipped_balance_entries: txns.length - valid.length, total_credits: totalCredits, total_debits: totalDebits, bank: parsed.bankId, account: parsed.accountId, period: { start: parsed.periodStart, end: parsed.periodEnd }, expenses_created: expensesCreated },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Erro inesperado", details: error instanceof Error ? error.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
