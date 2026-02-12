import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export interface RawRow {
  [key: string]: string | number | undefined;
}

export interface ImportResult {
  total: number;
  success: number;
  skipped: number;
  errors: { row: number; name: string; reason: string }[];
}

// Maps Evo column names → students table fields
const EVO_COLUMN_MAP: Record<string, string> = {
  nome: "full_name",
  "e-mail": "email",
  email: "email",
  "telefone/celular": "phone",
  telefone: "phone",
  celular: "phone",
  "cpf (cin)": "cpf",
  cpf: "cpf",
  "data de nascimento": "date_of_birth",
  bairro: "neighborhood",
  cidade: "city",
  contrato: "plan_name",
  "data do cadastro": "created_at_evo",
  "vencimento do contrato atual": "contract_end",
};

function normalizeKey(key: string) {
  return key.trim().toLowerCase();
}

function parseDate(val: string | number | undefined): string | null {
  if (!val) return null;
  const s = String(val).trim();
  // DD/MM/YYYY or DD/MM/YYYY HH:mm:ss
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function cleanPhone(val: string | number | undefined): string | null {
  if (!val) return null;
  // Take only the first phone if comma-separated
  const first = String(val).split(",")[0].trim();
  // Remove non-digits except +
  return first.replace(/[^\d+]/g, "") || null;
}

function cleanCpf(val: string | number | undefined): string | null {
  if (!val) return null;
  const digits = String(val).replace(/\D/g, "");
  return digits.length >= 11 ? digits.slice(0, 11) : digits || null;
}

export function useStudentImport() {
  const [rows, setRows] = useState<RawRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const parseFile = async (file: File) => {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "" });

    if (json.length === 0) {
      toast.error("Arquivo vazio ou sem dados.");
      return;
    }

    const hdrs = Object.keys(json[0]);
    setHeaders(hdrs);
    setRows(json);

    // Auto-map columns
    const autoMap: Record<string, string> = {};
    hdrs.forEach((h) => {
      const mapped = EVO_COLUMN_MAP[normalizeKey(h)];
      if (mapped) autoMap[h] = mapped;
    });
    setMapping(autoMap);
    setResult(null);
    toast.success(`${json.length} registros encontrados.`);
  };

  const importStudents = async () => {
    if (rows.length === 0) return;
    setImporting(true);

    const getVal = (row: RawRow, field: string) => {
      const col = Object.entries(mapping).find(([, v]) => v === field)?.[0];
      return col ? row[col] : undefined;
    };

    // Fetch existing CPFs and emails to detect duplicates
    const { data: existing } = await supabase
      .from("students")
      .select("cpf, email")
      .limit(10000);

    const existingCpfs = new Set(
      (existing ?? []).map((s) => s.cpf).filter(Boolean)
    );
    const existingEmails = new Set(
      (existing ?? [])
        .map((s) => s.email?.toLowerCase())
        .filter(Boolean)
    );

    const res: ImportResult = { total: rows.length, success: 0, skipped: 0, errors: [] };
    const BATCH_SIZE = 50;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const toInsert: any[] = [];

      batch.forEach((row, bIdx) => {
        const idx = i + bIdx;
        const name = String(getVal(row, "full_name") ?? "").trim();
        if (!name) {
          res.errors.push({ row: idx + 1, name: "-", reason: "Nome vazio" });
          return;
        }

        const cpf = cleanCpf(getVal(row, "cpf"));
        const email = String(getVal(row, "email") ?? "")
          .trim()
          .toLowerCase()
          .replace(/\\/g, "") || null;
        const phone = cleanPhone(getVal(row, "phone"));
        const dob = parseDate(getVal(row, "date_of_birth"));
        const neighborhood = String(getVal(row, "neighborhood") ?? "").trim() || null;
        const city = String(getVal(row, "city") ?? "").trim() || null;

        // Duplicate check
        if (cpf && existingCpfs.has(cpf)) {
          res.skipped++;
          res.errors.push({ row: idx + 1, name, reason: `CPF duplicado: ${cpf}` });
          return;
        }
        if (email && existingEmails.has(email)) {
          res.skipped++;
          res.errors.push({ row: idx + 1, name, reason: `E-mail duplicado: ${email}` });
          return;
        }

        // Mark as used
        if (cpf) existingCpfs.add(cpf);
        if (email) existingEmails.add(email);

        toInsert.push({
          full_name: name,
          email,
          phone,
          cpf,
          date_of_birth: dob,
          address: neighborhood || city
            ? { neighborhood, city } as unknown as Record<string, string>
            : null,
          status: "active" as const,
          is_active: true,
          notes: getVal(row, "plan_name")
            ? `Plano Evo: ${getVal(row, "plan_name")}`
            : null,
        });
      });

      if (toInsert.length > 0) {
        const { error } = await supabase.from("students").insert(toInsert);
        if (error) {
          toInsert.forEach((s) =>
            res.errors.push({
              row: i + 1,
              name: s.full_name,
              reason: error.message,
            })
          );
        } else {
          res.success += toInsert.length;
        }
      }
    }

    setResult(res);
    setImporting(false);

    if (res.success > 0) {
      toast.success(`${res.success} alunos importados com sucesso!`);
    }
    if (res.errors.length > 0) {
      toast.warning(`${res.errors.length} registros com problemas.`);
    }
  };

  return {
    rows,
    headers,
    mapping,
    setMapping,
    importing,
    result,
    parseFile,
    importStudents,
  };
}
