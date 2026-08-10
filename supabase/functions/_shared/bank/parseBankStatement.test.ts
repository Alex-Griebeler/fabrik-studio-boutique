import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleParseBankStatement,
  PARSER_VERSIONS,
  type ParseBankStatementDependencies,
  type XlsxCell,
} from "./parseBankStatement";
import {
  createFakeSupabase,
  type RecordedQuery,
} from "../finance/__fixtures__/fakeSupabaseClient";

const env: Record<string, string | undefined> = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const createClientMock = vi.fn();

function makeDeps(
  xlsxRows: XlsxCell[][] = [],
): ParseBankStatementDependencies {
  return {
    createClient: createClientMock,
    xlsxToRows: () => ({ sheetName: xlsxRows.length ? "Plan1" : null, rows: xlsxRows }),
  } as unknown as ParseBankStatementDependencies;
}

/**
 * OFX real em miniatura, no formato dos extratos do C6 usados na 2e: um
 * débito, um crédito e uma linha de saldo (descartada pelo classify).
 */
const OFX_SAMPLE = `OFXHEADER:100
<OFX>
<BANKID>336</BANKID>
<ACCTID>28819223581</ACCTID>
<DTSTART>20260301</DTSTART>
<DTEND>20260331</DTEND>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260302</DTPOSTED>
<TRNAMT>-150.00</TRNAMT>
<FITID>fit-debit-1</FITID>
<MEMO>PIX ENVIADO FORNECEDOR X</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20260303</DTPOSTED>
<TRNAMT>97.00</TRNAMT>
<FITID>fit-credit-1</FITID>
<MEMO>RECEBIMENTO REDE VISA CD</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>OTHER</TRNTYPE>
<DTPOSTED>20260331</DTPOSTED>
<TRNAMT>1000.00</TRNAMT>
<FITID>fit-saldo</FITID>
<MEMO>SALDO EM CONTA</MEMO>
</STMTTRN>
</OFX>`;

interface SetupOptions {
  role?: string | null;
  duplicateHash?: boolean;
}

function setup(options: SetupOptions = {}) {
  const fake = createFakeSupabase((query: RecordedQuery) => {
    if (query.table === "user_roles") {
      // Emula o filtro real: requireStaffRole consulta com in("role", allowed)
      // — um manager de verdade não devolve linha quando a allowlist é só
      // admin. Sem isto o fake autorizaria qualquer role.
      const role = options.role === undefined ? "admin" : options.role;
      if (!role) return { data: null };
      const inOp = query.ops.find((op) => op.method === "in" && op.args[0] === "role");
      const allowed = (inOp?.args[1] as string[] | undefined) ?? [];
      return { data: allowed.includes(role) ? { role } : null };
    }
    if (query.table === "bank_imports") {
      const isInsert = query.ops.some((op) => op.method === "insert");
      const isUpdate = query.ops.some((op) => op.method === "update");
      if (isInsert) return { data: { id: "imp-new" } };
      if (isUpdate) return { data: null };
      // dedupe lookup por hash
      return {
        data: options.duplicateHash
          ? [{ id: "imp-old", file_name: "antigo.ofx", created_at: "2026-03-04" }]
          : [],
      };
    }
    if (query.table === "bank_transactions") {
      const inserted = query.ops.find((op) => op.method === "insert");
      const rows = (inserted?.args[0] as unknown[]) ?? [];
      return { data: rows.map((_, i) => ({ id: `tx-${i}` })) };
    }
    return { data: null };
  });

  createClientMock.mockReturnValue(fake.client);
  return fake;
}

function request(body: unknown, token = "jwt-admin") {
  return new Request("https://example.test/parse-bank-statement", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function insertedInto(fake: ReturnType<typeof setup>, table: string) {
  return fake.queries
    .filter((q) => q.table === table && q.ops.some((op) => op.method === "insert"))
    .map((q) => q.ops.find((op) => op.method === "insert")?.args[0]);
}

describe("handleParseBankStatement", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", { env: { get: vi.fn((key: string) => env[key]) } });
    createClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("autorização", () => {
    it("responde 401 sem credencial, antes de qualquer leitura", async () => {
      const fake = setup();

      const res = await handleParseBankStatement(
        new Request("https://example.test/f", { method: "POST", body: "{}" }),
        makeDeps(),
      );

      expect(res.status).toBe(401);
      expect(fake.queries).toHaveLength(0);
    });

    it("responde 403 para manager — importação é admin-only desde a 2c-1 (A7)", async () => {
      const fake = setup({ role: "manager" });

      const res = await handleParseBankStatement(
        request({ fileContent: OFX_SAMPLE, fileName: "x.ofx", fileType: "ofx" }, "jwt-manager"),
        makeDeps(),
      );

      expect(res.status).toBe(403);
      expect(fake.mutations()).toEqual([]);
    });
  });

  describe("importação OFX", () => {
    it("carimba parser_version ofx-v2 no import (D8)", async () => {
      const fake = setup();

      const res = await handleParseBankStatement(
        request({ fileContent: OFX_SAMPLE, fileName: "extrato.ofx", fileType: "ofx" }),
        makeDeps(),
      );

      expect(res.status).toBe(200);
      const [importRow] = insertedInto(fake, "bank_imports") as Record<string, unknown>[];
      expect(importRow).toMatchObject({
        file_name: "extrato.ofx",
        parser_version: PARSER_VERSIONS.ofx,
        imported_by: "user-for-jwt-admin",
      });
    });

    it("insere as transações válidas e descarta a linha de saldo", async () => {
      const fake = setup();

      const res = await handleParseBankStatement(
        request({ fileContent: OFX_SAMPLE, fileName: "extrato.ofx", fileType: "ofx" }),
        makeDeps(),
      );

      const payload = await res.json();
      expect(payload.summary.total_transactions).toBe(2);
      expect(payload.summary.skipped_balance_entries).toBe(1);

      const [txRows] = insertedInto(fake, "bank_transactions") as Array<Record<string, unknown>[]>;
      expect(txRows).toHaveLength(2);
      expect(txRows.map((t) => t.fit_id)).toEqual(["fit-debit-1", "fit-credit-1"]);
    });

    // O coração da D4: a fábrica que transformava todo débito em despesa
    // `paid` (60 das 91 despesas-lixo) morreu. Nenhum caminho de importação
    // pode tocar em expenses ou expense_categories.
    it("NÃO cria despesa nenhuma a partir de débitos", async () => {
      const fake = setup();

      const res = await handleParseBankStatement(
        request({ fileContent: OFX_SAMPLE, fileName: "extrato.ofx", fileType: "ofx" }),
        makeDeps(),
      );

      expect(res.status).toBe(200);
      expect(fake.queries.some((q) => q.table === "expenses")).toBe(false);
      expect(fake.queries.some((q) => q.table === "expense_categories")).toBe(false);
      expect(fake.queries.some((q) => q.table === "expense_category_rules")).toBe(false);

      const payload = await res.json();
      expect(payload.summary).not.toHaveProperty("expenses_created");
    });

    it("as únicas escritas são bank_imports e bank_transactions", async () => {
      const fake = setup();

      await handleParseBankStatement(
        request({ fileContent: OFX_SAMPLE, fileName: "extrato.ofx", fileType: "ofx" }),
        makeDeps(),
      );

      const tables = [...new Set(fake.mutations().map((m) => m.table))].sort();
      expect(tables).toEqual(["bank_imports", "bank_transactions"]);
    });
  });

  describe("importação XLSX", () => {
    it("carimba parser_version xlsx-v1 e usa o decodificador injetado", async () => {
      const fake = setup();
      const rows: XlsxCell[][] = [
        ["Vencimento", "18/02/2026"],
        ["10/02", "COMPRA SUPERMERCADO", "R$", "123,45"],
      ];

      // Conteúdo base64 de mentira: o decodificador injetado ignora os bytes.
      const res = await handleParseBankStatement(
        request({ fileContent: btoa("fake-xlsx"), fileName: "Fatura.xlsx", fileType: "xlsx" }),
        makeDeps(rows),
      );

      expect(res.status).toBe(200);
      const [importRow] = insertedInto(fake, "bank_imports") as Record<string, unknown>[];
      expect(importRow).toMatchObject({ parser_version: PARSER_VERSIONS.xlsx });

      const [txRows] = insertedInto(fake, "bank_transactions") as Array<Record<string, unknown>[]>;
      expect(txRows).toHaveLength(1);
      expect(txRows[0]).toMatchObject({ transaction_type: "debit", amount_cents: 12345 });
    });
  });

  describe("dedupe por hash", () => {
    it("responde 409 para arquivo já importado", async () => {
      const fake = setup({ duplicateHash: true });

      const res = await handleParseBankStatement(
        request({ fileContent: OFX_SAMPLE, fileName: "extrato.ofx", fileType: "ofx" }),
        makeDeps(),
      );

      expect(res.status).toBe(409);
      expect(fake.mutations()).toEqual([]);
    });

    it("forceImport true pula a dedupe e importa", async () => {
      const fake = setup({ duplicateHash: true });

      const res = await handleParseBankStatement(
        request({ fileContent: OFX_SAMPLE, fileName: "extrato.ofx", fileType: "ofx", forceImport: true }),
        makeDeps(),
      );

      expect(res.status).toBe(200);
      expect(insertedInto(fake, "bank_imports")).toHaveLength(1);
    });
  });
});
