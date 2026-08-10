import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import {
  handleParseBankStatement,
  type XlsxCell,
} from "../_shared/bank/parseBankStatement.ts";

/**
 * Importa extrato bancário (OFX/CSV/XLSX) para bank_imports/bank_transactions.
 *
 * Exige JWT de staff `admin`: sem credencial => 401, sem role => 403. Bearer
 * de service_role não é aceito (não há chamador interno).
 *
 * Desde a Onda 2c-1: cada importação carrega `parser_version` (allowlist de
 * confiança nas RPCs de conciliação) e débito importado NÃO cria mais despesa
 * automática — a criação explícita por RPC chega na 2c-3.
 *
 * A implementacao vive em `_shared/bank/` para ficar sem import de VALOR do
 * SDK/XLSX e assim ser coberta por teste (ambos entram por injecao).
 */
Deno.serve((req) =>
  handleParseBankStatement(req, {
    createClient,
    xlsxToRows: (bytes: Uint8Array) => {
      const workbook = XLSX.read(bytes, { type: "array" });
      const sheetName = workbook.SheetNames[0] ?? null;
      const sheet = sheetName ? workbook.Sheets[sheetName] : null;
      const rows = sheet
        ? (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as XlsxCell[][])
        : [];
      return { sheetName, rows };
    },
  })
);
