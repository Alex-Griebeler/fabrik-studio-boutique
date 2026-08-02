import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleMatchBankTransactions } from "./matchBankTransactions";
import type { BankDependencies } from "./bankAuth";
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
const dependencies = { createClient: createClientMock } as unknown as BankDependencies;

const TODAY = "2026-08-02";

function used(query: RecordedQuery, method: string) {
  return query.ops.some((op) => op.method === method);
}

function hasEq(query: RecordedQuery, column: string, value: unknown) {
  return query.ops.some(
    (op) => op.method === "eq" && op.args[0] === column && op.args[1] === value,
  );
}

/**
 * Crédito Rede: R$ 100,00 de fatura recebidos como R$ 97,00 líquidos.
 * Diferença de 300 centavos = taxa da maquininha, dentro dos 5% tolerados.
 */
const REDE_TX = {
  id: "tx-rede",
  amount_cents: 9700,
  posted_date: TODAY,
  transaction_type: "credit",
  memo: "CRED REDE LOJA",
  parsed_name: null,
  parsed_type: "card_credit",
  processor_fee_cents: null,
  match_status: "unmatched",
  is_balance_entry: false,
};

const REDE_INVOICE = {
  id: "inv-rede",
  amount_cents: 10000,
  due_date: TODAY,
  student_id: "student-1",
  reference_month: "2026-08",
  contract_id: "contract-1",
};

function setup(options: { role?: string | null } = {}) {
  const fake = createFakeSupabase((query) => {
    if (query.table === "user_roles") {
      const role = options.role === undefined ? "manager" : options.role;
      return { data: role ? { role } : null };
    }
    if (query.table === "bank_transactions") {
      if (used(query, "update")) return { data: null };
      return { data: [REDE_TX] };
    }
    if (query.table === "invoices") {
      if (used(query, "update")) return { data: null };
      return { data: [REDE_INVOICE] };
    }
    if (query.table === "expenses") {
      if (used(query, "insert") || used(query, "update")) return { data: [{ id: "exp-fee" }] };
      return { data: [] };
    }
    if (query.table === "students") {
      return { data: [{ id: "student-1", full_name: "Aluna Teste" }] };
    }
    if (query.table === "expense_categories") {
      if (used(query, "insert")) return { data: [{ id: "cat-taxa" }] };
      return { data: [{ id: "cat-taxa" }] };
    }
    return { data: null };
  });

  createClientMock.mockReturnValue(fake.client);
  return fake;
}

function request(body: unknown, token = "jwt-manager") {
  return new Request("https://example.test/match-bank-transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("handleMatchBankTransactions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00.000Z`));
    vi.stubGlobal("Deno", { env: { get: vi.fn((key: string) => env[key]) } });
    createClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("autorização", () => {
    it("responde 401 sem credencial, antes de qualquer leitura", async () => {
      const fake = setup();

      const res = await handleMatchBankTransactions(
        new Request("https://example.test/f", { method: "POST", body: "{}" }),
        dependencies,
      );

      expect(res.status).toBe(401);
      expect(fake.queries).toHaveLength(0);
      expect(fake.mutations()).toEqual([]);
    });

    // O buraco que a PR fecha: JWT de aluno é emitido legitimamente pelo app.
    it("responde 403 para usuário sem role de staff, sem tocar em dado bancário", async () => {
      const fake = setup({ role: null });

      const res = await handleMatchBankTransactions(
        request({ import_id: null, auto_apply: true }, "jwt-de-aluno"),
        dependencies,
      );

      expect(res.status).toBe(403);
      expect(fake.mutations()).toEqual([]);
      expect(fake.queries.some((q) => q.table === "bank_transactions")).toBe(false);
      expect(fake.queries.some((q) => q.table === "invoices")).toBe(false);
    });

    it("autoriza manager", async () => {
      setup({ role: "manager" });

      const res = await handleMatchBankTransactions(
        request({ auto_apply: false }),
        dependencies,
      );

      expect(res.status).toBe(200);
    });
  });

  describe("preview (auto_apply ausente ou false)", () => {
    it("não executa NENHUMA escrita", async () => {
      const fake = setup();

      const res = await handleMatchBankTransactions(
        request({ import_id: null, auto_apply: false }),
        dependencies,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ success: true });
      expect(fake.mutations()).toEqual([]);
      expect(fake.rpcCalls).toEqual([]);
    });

    // Regressão do achado: a taxa Rede era gravada durante a varredura,
    // então "simular conciliação" escrevia em bank_transactions.
    it("não grava processor_fee_cents ao apenas sugerir match Rede", async () => {
      const fake = setup();

      const res = await handleMatchBankTransactions(request({}), dependencies);

      const payload = await res.json();
      expect(payload.matches).toHaveLength(1);
      expect(payload.matches[0].reason).toContain("Rede:");
      expect(fake.mutations()).toEqual([]);
    });

    it("só o booleano true aplica; a string 'true' continua sendo preview", async () => {
      const fake = setup();

      await handleMatchBankTransactions(
        request({ auto_apply: "true" }),
        dependencies,
      );

      expect(fake.mutations()).toEqual([]);
    });
  });

  describe("import_id inválido", () => {
    // Normalizar para null viraria varredura global — o oposto do pedido.
    it("responde 400 e não escreve nada, mesmo com auto_apply true", async () => {
      const fake = setup();

      const res = await handleMatchBankTransactions(
        request({ import_id: 42, auto_apply: true }),
        dependencies,
      );

      expect(res.status).toBe(400);
      expect(fake.mutations()).toEqual([]);
      expect(fake.queries.some((q) => q.table === "bank_transactions")).toBe(false);
    });
  });

  describe("auto_apply", () => {
    it("aplica o match, grava a taxa e cria UMA despesa de taxa na primeira execução", async () => {
      const fake = setup();

      const res = await handleMatchBankTransactions(
        request({ auto_apply: true }),
        dependencies,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        stats: { auto_applied: 1 },
      });

      // Taxa gravada com o valor calculado nesta execução (10000 - 9700).
      const feeUpdate = fake.queries
        .filter((q) => q.table === "bank_transactions" && used(q, "update"))
        .map((q) => q.ops.find((op) => op.method === "update")?.args[0] as Record<string, unknown>)
        .find((args) => args?.processor_fee_cents !== undefined);
      expect(feeUpdate).toMatchObject({ processor_fee_cents: 300 });

      // A despesa de taxa nasce já na primeira execução — antes o passo 6 lia
      // o array carregado antes do update e pulava sempre.
      const feeExpenses = fake.queries
        .filter((q) => q.table === "expenses" && used(q, "insert"))
        .map((q) => q.ops.find((op) => op.method === "insert")?.args[0] as Record<string, unknown>);
      expect(feeExpenses).toHaveLength(1);
      expect(feeExpenses[0]).toMatchObject({
        amount_cents: 300,
        status: "paid",
        category_id: "cat-taxa",
      });

      // E a fatura correspondente foi quitada.
      const invoiceUpdate = fake.queries
        .find((q) => q.table === "invoices" && used(q, "update"))
        ?.ops.find((op) => op.method === "update")?.args[0];
      expect(invoiceUpdate).toMatchObject({ status: "paid" });
    });

    it("registra matched_by com o usuário autenticado", async () => {
      const fake = setup();

      await handleMatchBankTransactions(request({ auto_apply: true }), dependencies);

      const statusUpdate = fake.queries
        .filter((q) => q.table === "bank_transactions" && used(q, "update"))
        .map((q) => q.ops.find((op) => op.method === "update")?.args[0] as Record<string, unknown>)
        .find((args) => args?.match_status !== undefined);
      expect(statusUpdate).toMatchObject({
        match_status: "auto_matched",
        matched_by: "user-for-jwt-manager",
      });
    });

    it("filtra por import_id quando informado", async () => {
      const fake = setup();

      await handleMatchBankTransactions(
        request({ import_id: "imp-1", auto_apply: false }),
        dependencies,
      );

      const txQuery = fake.queries.find((q) => q.table === "bank_transactions");
      expect(hasEq(txQuery!, "import_id", "imp-1")).toBe(true);
    });
  });
});
