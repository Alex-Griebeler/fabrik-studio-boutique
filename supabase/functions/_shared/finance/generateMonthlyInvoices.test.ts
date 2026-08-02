import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleGenerateMonthlyInvoices } from "./generateMonthlyInvoices";
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

function hasEq(query: RecordedQuery, column: string, value: unknown) {
  return query.ops.some(
    (op) => op.method === "eq" && op.args[0] === column && op.args[1] === value,
  );
}

/** 3 parcelas de um total que nao divide exato — exercita o arredondamento. */
const CONTRACT = {
  id: "contract-1",
  student_id: "student-1",
  start_date: "2026-08-01",
  payment_method: "dcc",
  installments: 3,
  total_value_cents: 10000,
  monthly_value_cents: null,
  discount_cents: 0,
};

const RECURRING_EXPENSE = {
  id: "exp-1",
  category_id: "cat-1",
  supplier_id: "sup-1",
  description: "Aluguel",
  amount_cents: 120000,
  due_date: "2026-05-10",
  payment_method: "pix",
  recurrence: "monthly",
};

/**
 * Datas derivadas exatamente como a implementação deriva. Não são
 * hard-coded porque o código atual mistura meia-noite LOCAL
 * (`new Date("...T00:00:00")`, `new Date(y, m, 1)`) com `toISOString()` em
 * UTC — o dia resultante muda conforme o fuso da máquina. Esse acoplamento é
 * pré-existente e é escopo do PR M; aqui ele é preservado, não corrigido.
 */
const isoDay = (date: Date) => date.toISOString().substring(0, 10);

function installmentDue(offsetDays: number) {
  const date = new Date(`${CONTRACT.start_date}T00:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return isoDay(date);
}

const COMPETENCE_DATE = new Date(2026, 7, 1);
const COMPETENCE = isoDay(COMPETENCE_DATE);
const RECURRING_CHILD_DUE = [
  COMPETENCE_DATE.getFullYear(),
  String(COMPETENCE_DATE.getMonth() + 1).padStart(2, "0"),
  String(new Date(RECURRING_EXPENSE.due_date).getDate()).padStart(2, "0"),
].join("-");

function setup(options: {
  role?: string | null;
  existingChild?: unknown[];
  contract?: Record<string, unknown>;
  lastInvoiceError?: string;
  scheduledError?: string;
} = {}) {
  const fake = createFakeSupabase((query) => {
    if (query.table === "finance_runtime_config") {
      return { data: { value: STORED_SECRET } };
    }
    if (query.table === "user_roles") {
      return { data: options.role === undefined ? { role: "admin" } : options.role ? { role: options.role } : null };
    }
    if (query.table === "contracts") return { data: options.contract ?? CONTRACT };
    if (query.table === "invoices") {
      // Lookup da última numeração: identificado pelo `like` em invoice_number.
      if (used(query, "like")) {
        return options.lastInvoiceError
          ? { data: null, error: { message: options.lastInvoiceError } }
          : { data: [{ invoice_number: "FAT-2026-00007" }] };
      }
      if (used(query, "insert")) {
        return { data: [{ id: "inv-a" }, { id: "inv-b" }, { id: "inv-c" }] };
      }
      return options.scheduledError
        ? { data: null, error: { message: options.scheduledError } }
        : { data: [{ id: "inv-sched" }] };
    }
    if (query.table === "expenses") {
      if (hasEq(query, "parent_expense_id", RECURRING_EXPENSE.id)) {
        return { data: options.existingChild ?? [] };
      }
      if (used(query, "insert")) return { data: [{ id: "exp-new" }] };
      return { data: [RECURRING_EXPENSE] };
    }
    return { data: null };
  });

  createClientMock.mockReturnValue(fake.client);
  return fake;
}

describe("handleGenerateMonthlyInvoices", () => {
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

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({ body: { mode: "contract-created", contract_id: "contract-1" } }),
        dependencies,
      );

      expect(res.status).toBe(401);
      expect(fake.queries).toHaveLength(0);
      expect(fake.mutations()).toEqual([]);
    });

    // (b)
    it("responde 401 com segredo errado e não escreve", async () => {
      const fake = setup();

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({ cronSecret: "b".repeat(64) }),
        dependencies,
      );

      expect(res.status).toBe(401);
      expect(fake.mutations()).toEqual([]);
    });

    // (c)
    it("autoriza service_role", async () => {
      setup();

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({ bearer: env.SUPABASE_SERVICE_ROLE_KEY }),
        dependencies,
      );

      expect(res.status).toBe(200);
    });

    // (d)
    it("autoriza segredo de cron", async () => {
      setup();

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({ cronSecret: STORED_SECRET }),
        dependencies,
      );

      expect(res.status).toBe(200);
    });

    // Preserva a chamada legitima do app (useCreateContract).
    it("autoriza usuário admin com JWT (chamada do frontend)", async () => {
      setup({ role: "admin" });

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({
          bearer: "user-jwt",
          body: { mode: "contract-created", contract_id: "contract-1" },
        }),
        dependencies,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ charges_created: 3 });
    });

    it("responde 403 para usuário autenticado sem role admin", async () => {
      const fake = setup({ role: null });

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({
          bearer: "user-jwt",
          body: { mode: "contract-created", contract_id: "contract-1" },
        }),
        dependencies,
      );

      expect(res.status).toBe(403);
      expect(fake.mutations()).toEqual([]);
    });
  });

  // (e) e (g)
  describe("validateOnly", () => {
    it("contract-created: retorna as parcelas que criaria, sem inserir", async () => {
      const fake = setup();

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({
          cronSecret: STORED_SECRET,
          body: { mode: "contract-created", contract_id: "contract-1", validateOnly: true },
        }),
        dependencies,
      );

      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload).toMatchObject({
        success: true,
        validate_only: true,
        mode: "contract-created",
        charges_to_create: 3,
        payment_type: "dcc",
      });
      // Arredondamento preservado: 3333 + 3333 + 3334 = 10000.
      expect(payload.preview.map((p: { amount_cents: number }) => p.amount_cents))
        .toEqual([3333, 3333, 3334]);
      expect(payload.preview[0].invoice_number).toBe("FAT-2026-00008");

      expect(fake.mutations()).toEqual([]);
      expect(fake.rpcCalls).toEqual([]);
    });

    it("cron: conta ativações e recorrentes sem escrever", async () => {
      const fake = setup();

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({ cronSecret: STORED_SECRET, body: { validateOnly: true } }),
        dependencies,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        validate_only: true,
        mode: "cron",
        scheduled_to_activate: 1,
        recurring_expenses_to_create: 1,
        competence_date: COMPETENCE,
      });

      expect(fake.mutations()).toEqual([]);
    });

    // Item 2 da revisão: erro na leitura das agendadas não pode virar 2xx
    // dizendo "0 a ativar".
    it("cron: encerra com 500 quando a leitura das agendadas falha", async () => {
      const fake = setup({ scheduledError: "permission denied" });

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({ cronSecret: STORED_SECRET, body: { validateOnly: true } }),
        dependencies,
      );

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toMatchObject({
        stage: "scheduled",
        validate_only: true,
      });
      expect(fake.mutations()).toEqual([]);
    });

    // Item 4 da revisão: resposta coerente com o contrato do validateOnly.
    it("contract-created: valor líquido zerado responde validate_only com contagem zero", async () => {
      const fake = setup({
        contract: { ...CONTRACT, total_value_cents: 0, monthly_value_cents: null },
      });

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({
          cronSecret: STORED_SECRET,
          body: { mode: "contract-created", contract_id: "contract-1", validateOnly: true },
        }),
        dependencies,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        success: true,
        validate_only: true,
        mode: "contract-created",
        contract_id: "contract-1",
        charges_to_create: 0,
        preview: [],
      });
      expect(fake.mutations()).toEqual([]);
    });

    it("cron: encerra sem escrita quando a leitura de recorrentes falha", async () => {
      const fake = createFakeSupabase((query) => {
        if (query.table === "finance_runtime_config") return { data: { value: STORED_SECRET } };
        if (query.table === "invoices") return { data: [{ id: "inv-sched" }] };
        return { data: null, error: { message: "permission denied" } };
      });
      createClientMock.mockReturnValue(fake.client);

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({ cronSecret: STORED_SECRET, body: { validateOnly: true } }),
        dependencies,
      );

      expect(res.status).toBe(500);
      expect(fake.mutations()).toEqual([]);
    });
  });

  // Item 3 da revisão: a numeração não pode cair para FAT-<ano>-00001 por
  // causa de uma leitura que falhou — isso emitiria número duplicado.
  describe("sequência de numeração", () => {
    it("aborta a execução real com 500 quando o lookup da numeração falha", async () => {
      const fake = setup({ lastInvoiceError: "statement timeout" });

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({
          cronSecret: STORED_SECRET,
          body: { mode: "contract-created", contract_id: "contract-1" },
        }),
        dependencies,
      );

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toMatchObject({
        stage: "invoice_sequence",
        validate_only: false,
      });
      // O ponto do item: nenhuma cobrança foi inserida com numeração chutada.
      expect(fake.mutations()).toEqual([]);
    });

    it("aborta o validateOnly com 500 quando o lookup da numeração falha", async () => {
      const fake = setup({ lastInvoiceError: "statement timeout" });

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({
          cronSecret: STORED_SECRET,
          body: { mode: "contract-created", contract_id: "contract-1", validateOnly: true },
        }),
        dependencies,
      );

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toMatchObject({
        stage: "invoice_sequence",
        validate_only: true,
      });
      expect(fake.mutations()).toEqual([]);
    });
  });

  // (f)
  describe("execução real", () => {
    it("contract-created: insere as parcelas com o mesmo payload de antes", async () => {
      const fake = setup();

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({
          cronSecret: STORED_SECRET,
          body: { mode: "contract-created", contract_id: "contract-1" },
        }),
        dependencies,
      );

      expect(res.status).toBe(200);

      const inserted = fake.queries
        .find((q) => q.table === "invoices" && used(q, "insert"))
        ?.ops.find((op) => op.method === "insert")?.args[0] as Array<Record<string, unknown>>;

      expect(inserted).toHaveLength(3);
      expect(inserted[0]).toMatchObject({
        contract_id: "contract-1",
        student_id: "student-1",
        amount_cents: 3333,
        due_date: installmentDue(0),
        scheduled_date: installmentDue(0),
        status: "scheduled",
        payment_type: "dcc",
        installment_number: 1,
        total_installments: 3,
        invoice_number: "FAT-2026-00008",
        reference_month: installmentDue(0).substring(0, 7),
      });
      // Parcelas seguem o passo de 30 dias e a última absorve o arredondamento.
      expect(inserted[1]).toMatchObject({
        amount_cents: 3333,
        due_date: installmentDue(30),
        invoice_number: "FAT-2026-00009",
      });
      expect(inserted[2]).toMatchObject({
        amount_cents: 3334,
        installment_number: 3,
        invoice_number: "FAT-2026-00010",
        due_date: installmentDue(60),
      });
    });

    it("cron: ativa agendadas e cria recorrentes", async () => {
      const fake = setup();

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({ cronSecret: STORED_SECRET }),
        dependencies,
      );

      await expect(res.json()).resolves.toMatchObject({
        success: true,
        mode: "cron",
        scheduled_activated: 1,
        recurring_expenses_created: 1,
      });

      const update = fake.queries
        .find((q) => q.table === "invoices" && used(q, "update"))
        ?.ops.find((op) => op.method === "update")?.args[0];
      expect(update).toMatchObject({ status: "pending" });

      const expenseInsert = fake.queries
        .find((q) => q.table === "expenses" && used(q, "insert"))
        ?.ops.find((op) => op.method === "insert")?.args[0] as Array<Record<string, unknown>>;
      expect(expenseInsert[0]).toMatchObject({
        parent_expense_id: "exp-1",
        competence_date: COMPETENCE,
        due_date: RECURRING_CHILD_DUE,
        is_recurring: false,
        status: "pending",
      });
    });

    it("não recria despesa recorrente já existente na competência", async () => {
      const fake = setup({ existingChild: [{ id: "exp-child" }] });

      const res = await handleGenerateMonthlyInvoices(
        financeRequest({ cronSecret: STORED_SECRET }),
        dependencies,
      );

      await expect(res.json()).resolves.toMatchObject({ recurring_expenses_created: 0 });
      expect(fake.queries.some((q) => q.table === "expenses" && used(q, "insert"))).toBe(false);
    });
  });
});
