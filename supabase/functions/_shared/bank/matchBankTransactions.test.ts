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

function setup(options: {
  role?: string | null;
  invoiceUpdateError?: string;
  txUpdateError?: string;
  /** Simula outra execução tendo reservado a transação antes desta. */
  reservationLost?: boolean;
} = {}) {
  const fake = createFakeSupabase((query) => {
    if (query.table === "user_roles") {
      const role = options.role === undefined ? "manager" : options.role;
      return { data: role ? { role } : null };
    }
    if (query.table === "bank_transactions") {
      if (used(query, "update")) {
        if (options.txUpdateError) {
          return { data: null, error: { message: options.txUpdateError } };
        }
        // A reserva confirma a linha afetada; a reversão não usa select.
        if (used(query, "select")) {
          return { data: options.reservationLost ? [] : [{ id: REDE_TX.id }] };
        }
        return { data: null };
      }
      return { data: [REDE_TX] };
    }
    if (query.table === "invoices") {
      if (used(query, "update")) {
        return options.invoiceUpdateError
          ? { data: null, error: { message: options.invoiceUpdateError } }
          : { data: null };
      }
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

    // Antes, o erro de quitação era engolido: a transação virava conciliada,
    // a despesa de taxa nascia e a resposta dizia sucesso — com a fatura ainda
    // em aberto e sem retry possível, porque a transação saía do filtro.
    it("não reporta sucesso quando a quitação da fatura falha", async () => {
      const fake = setup({ invoiceUpdateError: "permission denied" });

      const res = await handleMatchBankTransactions(
        request({ auto_apply: true }),
        dependencies,
      );

      await expect(res.json()).resolves.toMatchObject({
        success: false,
        stats: { auto_applied: 0, auto_failed: 1 },
      });

      // Nenhuma despesa de taxa nasce de um match que não fechou.
      expect(fake.queries.some((q) => q.table === "expenses" && used(q, "insert"))).toBe(false);
    });

    // O cenário que a compensação existe para impedir: sem ela, a transação
    // ficaria livre com a fatura já quitada e, no retry, poderia quitar uma
    // SEGUNDA fatura de valor parecido — um pagamento pagando duas contas.
    it("reverte a reserva da transação quando a quitação falha", async () => {
      const fake = setup({ invoiceUpdateError: "permission denied" });

      await handleMatchBankTransactions(request({ auto_apply: true }), dependencies);

      const txUpdates = fake.queries
        .filter((q) => q.table === "bank_transactions" && used(q, "update"))
        .map((q) => q.ops.find((op) => op.method === "update")?.args[0] as Record<string, unknown>);

      // Uma reserva e uma reversão: o estado final devolve a transação ao pool.
      expect(txUpdates).toHaveLength(2);
      expect(txUpdates[0]).toMatchObject({ match_status: "auto_matched" });
      expect(txUpdates[1]).toMatchObject({
        match_status: "unmatched",
        matched_invoice_id: null,
        matched_by: null,
        processor_fee_cents: null,
      });
    });

    it("grava a taxa no mesmo update do match, não em escrita separada", async () => {
      const fake = setup();

      await handleMatchBankTransactions(request({ auto_apply: true }), dependencies);

      const txUpdates = fake.queries
        .filter((q) => q.table === "bank_transactions" && used(q, "update"))
        .map((q) => q.ops.find((op) => op.method === "update")?.args[0] as Record<string, unknown>);

      expect(txUpdates).toHaveLength(1);
      expect(txUpdates[0]).toMatchObject({
        match_status: "auto_matched",
        processor_fee_cents: 300,
      });
    });

    // Sem a reserva condicional, duas abas abertas conciliariam a mesma
    // entrada bancária contra faturas diferentes.
    it("desiste da transação já reservada por outra execução, sem quitar nada", async () => {
      const fake = setup({ reservationLost: true });

      const res = await handleMatchBankTransactions(
        request({ auto_apply: true }),
        dependencies,
      );

      await expect(res.json()).resolves.toMatchObject({
        success: false,
        stats: { auto_applied: 0, auto_failed: 1 },
      });

      // Nenhuma fatura foi quitada e nenhuma despesa de taxa criada.
      expect(fake.queries.some((q) => q.table === "invoices" && used(q, "update"))).toBe(false);
      expect(fake.queries.some((q) => q.table === "expenses" && used(q, "insert"))).toBe(false);
    });

    it("condiciona a reserva ao estado unmatched lido", async () => {
      const fake = setup();

      await handleMatchBankTransactions(request({ auto_apply: true }), dependencies);

      const reserva = fake.queries.find(
        (q) => q.table === "bank_transactions" && used(q, "update") && used(q, "select"),
      );
      expect(hasEq(reserva!, "match_status", "unmatched")).toBe(true);
    });

    it("falha ao reservar não quita nada", async () => {
      const fake = setup({ txUpdateError: "deadlock detected" });

      const res = await handleMatchBankTransactions(
        request({ auto_apply: true }),
        dependencies,
      );

      await expect(res.json()).resolves.toMatchObject({
        success: false,
        stats: { auto_applied: 0, auto_failed: 1 },
      });
      expect(fake.queries.some((q) => q.table === "invoices" && used(q, "update"))).toBe(false);
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
