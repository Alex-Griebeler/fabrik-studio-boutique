import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleDailyFinanceCron } from "./dailyFinanceCron";
import { getNextRecurrenceDate } from "./logic";
import type { FinanceDependencies } from "./cronAuth";
import {
  createFakeSupabase,
  financeRequest,
  type RecordedQuery,
} from "./__fixtures__/fakeSupabaseClient";

const env: Record<string, string | undefined> = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const STORED_SECRET = "a".repeat(64);
const TODAY = "2026-08-01";

const createClientMock = vi.fn();
const dependencies = { createClient: createClientMock } as unknown as FinanceDependencies;

function hasEq(query: RecordedQuery, column: string, value: unknown) {
  return query.ops.some(
    (op) => op.method === "eq" && op.args[0] === column && op.args[1] === value,
  );
}

function used(query: RecordedQuery, method: string) {
  return query.ops.some((op) => op.method === method);
}

/** Despesa recorrente que já venceu — vira candidata a geração. */
const RECURRING_EXPENSE = {
  id: "exp-1",
  category_id: "cat-1",
  supplier_id: "sup-1",
  description: "Aluguel",
  amount_cents: 120000,
  due_date: "2026-06-01",
  status: "pending",
  payment_method: "pix",
  recurrence: "monthly",
  recurring_frequency: "monthly",
  recurring_until: null,
};

/**
 * A data derivada é a mesma que a implementação calcula. Não é hard-coded de
 * propósito: `new Date("...T00:00:00")` é meia-noite LOCAL e `toISOString()`
 * é UTC, então o dia resultante depende do fuso da máquina. Esse acoplamento
 * é do código atual e fica para o PR M (timezone) — aqui só preservamos.
 */
const EXPECTED_NEXT_DUE = getNextRecurrenceDate(
  new Date(`${RECURRING_EXPENSE.due_date}T00:00:00`),
  "monthly",
).toISOString().substring(0, 10);

function setup(overrides: { existingChild?: unknown[] } = {}) {
  const fake = createFakeSupabase((query) => {
    if (query.table === "finance_runtime_config") {
      return { data: { value: STORED_SECRET } };
    }

    if (query.table === "invoices") {
      if (hasEq(query, "status", "pending")) {
        return { data: [{ id: "inv-1" }, { id: "inv-2" }], count: 2 };
      }
      if (hasEq(query, "status", "scheduled")) {
        return { data: [{ id: "inv-9" }], count: 1 };
      }
    }

    if (query.table === "expenses") {
      // Consulta de dedupe: filtra por parent_expense_id.
      if (hasEq(query, "parent_expense_id", RECURRING_EXPENSE.id)) {
        return { data: overrides.existingChild ?? [] };
      }
      if (used(query, "insert") || used(query, "update")) {
        return { data: [{ id: "exp-new" }] };
      }
      return { data: [RECURRING_EXPENSE] };
    }

    return { data: null };
  });

  createClientMock.mockReturnValue(fake.client);
  return fake;
}

describe("handleDailyFinanceCron", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00.000Z`));
    vi.stubGlobal("Deno", { env: { get: vi.fn((key: string) => env[key]) } });
    createClientMock.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("autenticação", () => {
    // (a)
    it("responde 401 sem credencial e não toca no banco", async () => {
      const fake = setup();

      const res = await handleDailyFinanceCron(financeRequest({}), dependencies);

      expect(res.status).toBe(401);
      expect(fake.queries).toHaveLength(0);
      expect(fake.mutations()).toEqual([]);
    });

    // (b)
    it("responde 401 com segredo errado e não escreve", async () => {
      const fake = setup();

      const res = await handleDailyFinanceCron(
        financeRequest({ cronSecret: "b".repeat(64) }),
        dependencies,
      );

      expect(res.status).toBe(401);
      expect(fake.mutations()).toEqual([]);
    });

    it("responde 401 para JWT de usuário (função é service-to-service)", async () => {
      const fake = setup();

      const res = await handleDailyFinanceCron(
        financeRequest({ bearer: "user-jwt" }),
        dependencies,
      );

      expect(res.status).toBe(401);
      expect(fake.mutations()).toEqual([]);
    });

    // (c)
    it("autoriza service_role", async () => {
      setup();

      const res = await handleDailyFinanceCron(
        financeRequest({ bearer: env.SUPABASE_SERVICE_ROLE_KEY }),
        dependencies,
      );

      expect(res.status).toBe(200);
    });

    // (d)
    it("autoriza segredo de cron", async () => {
      setup();

      const res = await handleDailyFinanceCron(
        financeRequest({ cronSecret: STORED_SECRET }),
        dependencies,
      );

      expect(res.status).toBe(200);
    });
  });

  // (e) e (g)
  describe("validateOnly", () => {
    it("retorna 2xx com contagem e não executa nenhuma escrita", async () => {
      const fake = setup();

      const res = await handleDailyFinanceCron(
        financeRequest({ cronSecret: STORED_SECRET, body: { validateOnly: true } }),
        dependencies,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        success: true,
        validate_only: true,
        overdue_candidates: 2,
        dcc_activation_candidates: 1,
        recurring_candidates: 1,
        preview: {
          overdue_invoice_ids: ["inv-1", "inv-2"],
          dcc_invoice_ids: ["inv-9"],
          recurring_parent_expense_ids: ["exp-1"],
        },
      });

      expect(fake.mutations()).toEqual([]);
      expect(fake.rpcCalls).toEqual([]);
    });

    it("respeita o dedupe: despesa já gerada não vira candidata", async () => {
      const fake = setup({ existingChild: [{ id: "exp-child" }] });

      const res = await handleDailyFinanceCron(
        financeRequest({ cronSecret: STORED_SECRET, body: { validateOnly: true } }),
        dependencies,
      );

      await expect(res.json()).resolves.toMatchObject({ recurring_candidates: 0 });
      expect(fake.mutations()).toEqual([]);
    });

    it("encerra sem escrita quando uma leitura falha", async () => {
      const fake = createFakeSupabase((query) => {
        if (query.table === "finance_runtime_config") {
          return { data: { value: STORED_SECRET } };
        }
        return { data: null, error: { message: "permission denied" } };
      });
      createClientMock.mockReturnValue(fake.client);

      const res = await handleDailyFinanceCron(
        financeRequest({ cronSecret: STORED_SECRET, body: { validateOnly: true } }),
        dependencies,
      );

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toMatchObject({ validate_only: true });
      expect(fake.mutations()).toEqual([]);
    });
  });

  // (f) execucao real permanece igual
  describe("execução real", () => {
    it("mantém as três operações com os mesmos payloads", async () => {
      const fake = setup();

      const res = await handleDailyFinanceCron(
        financeRequest({ cronSecret: STORED_SECRET }),
        dependencies,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        success: true,
        overdue_marked: 2,
        dcc_activated: 1,
        recurring_generated: 1,
      });

      const invoiceUpdates = fake.queries
        .filter((q) => q.table === "invoices" && used(q, "update"))
        .map((q) => q.ops.find((op) => op.method === "update")?.args[0]);

      expect(invoiceUpdates[0]).toMatchObject({ status: "overdue" });
      expect(invoiceUpdates[1]).toMatchObject({ status: "pending" });

      const insert = fake.queries
        .find((q) => q.table === "expenses" && used(q, "insert"))
        ?.ops.find((op) => op.method === "insert")?.args[0] as Record<string, unknown>;

      expect(insert).toMatchObject({
        parent_expense_id: "exp-1",
        amount_cents: 120000,
        due_date: EXPECTED_NEXT_DUE,
        competence_date: EXPECTED_NEXT_DUE,
        status: "pending",
        is_recurring: true,
      });
      // Regra preservada: o filho herda o valor do pai e nasce como recorrente.
      expect(insert.notes).toBe("Gerado automaticamente a partir da despesa recorrente");
    });

    it("não gera despesa recorrente já existente", async () => {
      const fake = setup({ existingChild: [{ id: "exp-child" }] });

      const res = await handleDailyFinanceCron(
        financeRequest({ cronSecret: STORED_SECRET }),
        dependencies,
      );

      await expect(res.json()).resolves.toMatchObject({ recurring_generated: 0 });
      expect(fake.queries.some((q) => q.table === "expenses" && used(q, "insert"))).toBe(false);
    });
  });
});
