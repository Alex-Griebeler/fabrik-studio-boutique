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
 * Diferença de 300 centavos = taxa estimada, dentro dos 5% tolerados.
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

const PENDING_EXPENSE = {
  id: "exp-1",
  amount_cents: 15000,
  due_date: TODAY,
  description: "ALUGUEL SALA",
  category_id: "cat-1",
};

const DEBIT_TX = {
  id: "tx-debit",
  amount_cents: -15000,
  posted_date: TODAY,
  transaction_type: "debit",
  memo: "PIX ENVIADO ALUGUEL SALA COMERCIAL",
  parsed_name: null,
  parsed_type: "pix_sent",
  processor_fee_cents: null,
  match_status: "unmatched",
  is_balance_entry: false,
};

function setup(options: { role?: string | null } = {}) {
  const fake = createFakeSupabase((query) => {
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
    if (query.table === "bank_transactions") {
      return { data: [REDE_TX, DEBIT_TX] };
    }
    if (query.table === "invoices") {
      return { data: [REDE_INVOICE] };
    }
    if (query.table === "expenses") {
      return { data: [PENDING_EXPENSE] };
    }
    if (query.table === "students") {
      return { data: [{ id: "student-1", full_name: "Aluna Teste" }] };
    }
    return { data: null };
  });

  createClientMock.mockReturnValue(fake.client);
  return fake;
}

function request(body: unknown, token = "jwt-admin") {
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

    it("responde 403 para usuário sem role de staff, sem tocar em dado bancário", async () => {
      const fake = setup({ role: null });

      const res = await handleMatchBankTransactions(
        request({ import_id: null }, "jwt-de-aluno"),
        dependencies,
      );

      expect(res.status).toBe(403);
      expect(fake.mutations()).toEqual([]);
      expect(fake.queries.some((q) => q.table === "bank_transactions")).toBe(false);
      expect(fake.queries.some((q) => q.table === "invoices")).toBe(false);
    });

    // A7 do plano 2c: manager saiu da superfície bancária (revisão fria vetou
    // ampliar financeiro a um papel sem uso em produção).
    it("responde 403 para manager — conciliação é admin-only desde a 2c-1", async () => {
      const fake = setup({ role: "manager" });

      const res = await handleMatchBankTransactions(
        request({}, "jwt-manager"),
        dependencies,
      );

      expect(res.status).toBe(403);
      expect(fake.queries.some((q) => q.table === "bank_transactions")).toBe(false);
    });

    it("autoriza admin", async () => {
      setup({ role: "admin" });

      const res = await handleMatchBankTransactions(request({}), dependencies);

      expect(res.status).toBe(200);
    });
  });

  describe("contrato: auto_apply não existe mais", () => {
    // Cliente antigo pedindo aplicação precisa descobrir que o contrato
    // mudou — não acreditar que aplicou.
    it("responde 400 para auto_apply true, sem ler nem escrever nada bancário", async () => {
      const fake = setup();

      const res = await handleMatchBankTransactions(
        request({ auto_apply: true }),
        dependencies,
      );

      expect(res.status).toBe(400);
      const payload = await res.json();
      expect(payload.error).toContain("auto_apply");
      expect(fake.mutations()).toEqual([]);
      expect(fake.queries.some((q) => q.table === "bank_transactions")).toBe(false);
    });

    it("valores não-literais de auto_apply seguem sendo sugestão normal", async () => {
      const fake = setup();

      const res = await handleMatchBankTransactions(
        request({ auto_apply: "true" }),
        dependencies,
      );

      expect(res.status).toBe(200);
      expect(fake.mutations()).toEqual([]);
    });
  });

  describe("somente-sugestão", () => {
    it("não executa NENHUMA escrita em nenhum caminho", async () => {
      const fake = setup();

      const res = await handleMatchBankTransactions(
        request({ import_id: null }),
        dependencies,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ success: true });
      expect(fake.mutations()).toEqual([]);
      expect(fake.rpcCalls).toEqual([]);
    });

    it("sugere o par Rede com a taxa APENAS no texto do motivo", async () => {
      const fake = setup();

      const res = await handleMatchBankTransactions(request({}), dependencies);

      const payload = await res.json();
      const rede = payload.matches.find((m: { transaction_id: string }) => m.transaction_id === "tx-rede");
      expect(rede).toBeDefined();
      expect(rede.matched_type).toBe("invoice");
      expect(rede.reason).toContain("taxa estimada");
      // Nada foi gravado: nem processor_fee_cents, nem despesa de taxa.
      expect(fake.mutations()).toEqual([]);
      expect(fake.queries.some((q) => q.table === "expense_categories")).toBe(false);
    });

    it("sugere débito × despesa pendente", async () => {
      const fake = setup();

      const res = await handleMatchBankTransactions(request({}), dependencies);

      const payload = await res.json();
      const debit = payload.matches.find((m: { transaction_id: string }) => m.transaction_id === "tx-debit");
      expect(debit).toBeDefined();
      expect(debit.matched_type).toBe("expense");
      expect(debit.matched_id).toBe("exp-1");
      expect(fake.mutations()).toEqual([]);
    });

    it("a resposta não tem mais estatística de aplicação", async () => {
      setup();

      const res = await handleMatchBankTransactions(request({}), dependencies);

      const payload = await res.json();
      expect(payload.stats).not.toHaveProperty("auto_applied");
      expect(payload.stats).not.toHaveProperty("auto_failed");
      expect(payload.stats).toMatchObject({ total_transactions: 2, total_matches: 2 });
    });
  });

  describe("import_id", () => {
    it("inválido responde 400 e não lê dado bancário", async () => {
      const fake = setup();

      const res = await handleMatchBankTransactions(
        request({ import_id: 42 }),
        dependencies,
      );

      expect(res.status).toBe(400);
      expect(fake.queries.some((q) => q.table === "bank_transactions")).toBe(false);
    });

    it("filtra por import_id quando informado", async () => {
      const fake = setup();

      await handleMatchBankTransactions(
        request({ import_id: "imp-1" }),
        dependencies,
      );

      const txQuery = fake.queries.find((q) => q.table === "bank_transactions");
      expect(hasEq(txQuery!, "import_id", "imp-1")).toBe(true);
    });
  });
});
