import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleCalculateInvoicePenalties } from "./calculateInvoicePenalties";
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

const createClientMock = vi.fn();
const dependencies = { createClient: createClientMock } as unknown as FinanceDependencies;

function used(query: RecordedQuery, method: string) {
  return query.ops.some((op) => op.method === method);
}

/**
 * R$1.000,00 vencida em 01/07 com "hoje" = 01/08 => 31 dias.
 * Multa 2% = 2000; juros diarios round(100000*0.00033) = 33 => 33*31 = 1023,
 * acima do teto mensal round(100000*0.01) = 1000 => juros travam em 1000.
 */
const OVERDUE_INVOICE = {
  id: "inv-1",
  amount_cents: 100000,
  due_date: "2026-07-01",
  fine_amount_cents: null,
  interest_amount_cents: null,
  status: "pending",
  payment_type: "dcc",
};

/** Vence hoje: daysOverdue = 0, precisa ser ignorada nos dois caminhos. */
const NOT_YET_OVERDUE = {
  ...OVERDUE_INVOICE,
  id: "inv-2",
  due_date: "2026-08-01",
  status: "overdue",
};

function setup(
  options: { invoices?: unknown[]; invoiceError?: string; policyError?: string } = {},
) {
  const fake = createFakeSupabase((query) => {
    if (query.table === "finance_runtime_config") {
      return { data: { value: STORED_SECRET } };
    }
    if (query.table === "policies") {
      return options.policyError
        ? { data: null, error: { message: options.policyError } }
        : { data: [] };
    }
    if (query.table === "invoices") {
      if (used(query, "update")) return { data: null };
      if (options.invoiceError) {
        return { data: null, error: { message: options.invoiceError } };
      }
      return { data: options.invoices ?? [OVERDUE_INVOICE, NOT_YET_OVERDUE] };
    }
    return { data: null };
  });

  createClientMock.mockReturnValue(fake.client);
  return fake;
}

describe("handleCalculateInvoicePenalties", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));
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

      const res = await handleCalculateInvoicePenalties(financeRequest({}), dependencies);

      expect(res.status).toBe(401);
      expect(fake.queries).toHaveLength(0);
      expect(fake.mutations()).toEqual([]);
    });

    // (b)
    it("responde 401 com segredo errado e não escreve", async () => {
      const fake = setup();

      const res = await handleCalculateInvoicePenalties(
        financeRequest({ cronSecret: "b".repeat(64) }),
        dependencies,
      );

      expect(res.status).toBe(401);
      expect(fake.mutations()).toEqual([]);
    });

    it("responde 401 para JWT de usuário (função é service-to-service)", async () => {
      const fake = setup();

      const res = await handleCalculateInvoicePenalties(
        financeRequest({ bearer: "user-jwt" }),
        dependencies,
      );

      expect(res.status).toBe(401);
      expect(fake.mutations()).toEqual([]);
    });

    // (c)
    it("autoriza service_role", async () => {
      setup();

      const res = await handleCalculateInvoicePenalties(
        financeRequest({ bearer: env.SUPABASE_SERVICE_ROLE_KEY }),
        dependencies,
      );

      expect(res.status).toBe(200);
    });

    // (d)
    it("autoriza segredo de cron", async () => {
      setup();

      const res = await handleCalculateInvoicePenalties(
        financeRequest({ cronSecret: STORED_SECRET }),
        dependencies,
      );

      expect(res.status).toBe(200);
    });
  });

  // (e) e (g)
  describe("validateOnly", () => {
    it("calcula multa/juros e não executa nenhuma escrita", async () => {
      const fake = setup();

      const res = await handleCalculateInvoicePenalties(
        financeRequest({ cronSecret: STORED_SECRET, body: { validateOnly: true } }),
        dependencies,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        success: true,
        validate_only: true,
        total_overdue: 2,
        would_update: 1,
        would_change_status: 1,
        preview: [
          {
            id: "inv-1",
            days_overdue: 31,
            fine_amount_cents: 2000,
            interest_amount_cents: 1000,
            status_change: "overdue",
          },
        ],
      });

      expect(fake.mutations()).toEqual([]);
      expect(fake.rpcCalls).toEqual([]);
    });

    it("encerra sem escrita quando a leitura das cobranças falha", async () => {
      const fake = setup({ invoiceError: "permission denied" });

      const res = await handleCalculateInvoicePenalties(
        financeRequest({ cronSecret: STORED_SECRET, body: { validateOnly: true } }),
        dependencies,
      );

      expect(res.status).toBe(500);
      expect(fake.mutations()).toEqual([]);
    });
  });

  // Falha ao ler policies não pode virar "aplica os defaults e grava".
  describe("políticas de multa e juros", () => {
    it("aborta a execução real com 500 e sem escrita quando a leitura falha", async () => {
      const fake = setup({ policyError: "permission denied" });

      const res = await handleCalculateInvoicePenalties(
        financeRequest({ cronSecret: STORED_SECRET }),
        dependencies,
      );

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toMatchObject({
        stage: "policies",
        validate_only: false,
      });
      expect(fake.mutations()).toEqual([]);
      // Aborta antes de sequer buscar as cobranças.
      expect(fake.queries.some((q) => q.table === "invoices")).toBe(false);
    });

    it("aborta o validateOnly com 500 e sem escrita quando a leitura falha", async () => {
      const fake = setup({ policyError: "permission denied" });

      const res = await handleCalculateInvoicePenalties(
        financeRequest({ cronSecret: STORED_SECRET, body: { validateOnly: true } }),
        dependencies,
      );

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toMatchObject({
        stage: "policies",
        validate_only: true,
      });
      expect(fake.mutations()).toEqual([]);
      expect(fake.queries.some((q) => q.table === "invoices")).toBe(false);
    });

    // Tabela vazia continua sendo caso normal: default é a regra.
    it("usa os defaults quando não há linha de policy (sem erro)", async () => {
      setup();

      const res = await handleCalculateInvoicePenalties(
        financeRequest({ cronSecret: STORED_SECRET }),
        dependencies,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        config: { fineRatePct: 2, dailyInterestPct: 0.033, maxMonthlyInterestPct: 1 },
      });
    });
  });

  // (f)
  describe("execução real", () => {
    it("grava exatamente os mesmos valores calculados", async () => {
      const fake = setup();

      const res = await handleCalculateInvoicePenalties(
        financeRequest({ cronSecret: STORED_SECRET }),
        dependencies,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        success: true,
        total_overdue: 2,
        updated: 1,
        status_changed: 1,
        config: { fineRatePct: 2, dailyInterestPct: 0.033, maxMonthlyInterestPct: 1 },
      });

      const updates = fake.queries
        .filter((q) => q.table === "invoices" && used(q, "update"))
        .map((q) => q.ops.find((op) => op.method === "update")?.args[0]);

      // Só a vencida de fato entra; o teto mensal de juros foi respeitado.
      expect(updates).toHaveLength(1);
      expect(updates[0]).toEqual({
        fine_amount_cents: 2000,
        interest_amount_cents: 1000,
        status: "overdue",
      });
    });

    it("não altera status de cobrança que já está overdue", async () => {
      const fake = setup({
        invoices: [{ ...OVERDUE_INVOICE, status: "overdue" }],
      });

      const res = await handleCalculateInvoicePenalties(
        financeRequest({ cronSecret: STORED_SECRET }),
        dependencies,
      );

      await expect(res.json()).resolves.toMatchObject({ status_changed: 0 });

      const update = fake.queries
        .find((q) => q.table === "invoices" && used(q, "update"))
        ?.ops.find((op) => op.method === "update")?.args[0] as Record<string, unknown>;
      expect(update).not.toHaveProperty("status");
    });

    it("responde sem escrever quando não há cobrança DCC vencida", async () => {
      const fake = setup({ invoices: [] });

      const res = await handleCalculateInvoicePenalties(
        financeRequest({ cronSecret: STORED_SECRET }),
        dependencies,
      );

      await expect(res.json()).resolves.toMatchObject({ success: true, updated: 0 });
      expect(fake.mutations()).toEqual([]);
    });
  });
});
