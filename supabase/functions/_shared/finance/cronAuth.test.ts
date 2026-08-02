import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireFinanceAuth, type FinanceDependencies } from "./cronAuth";
import { createFakeSupabase, type QueryResolver } from "./__fixtures__/fakeSupabaseClient";

const env: Record<string, string | undefined> = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const STORED_SECRET = "a".repeat(64);
const WRONG_SECRET = "b".repeat(64);

const createClientMock = vi.fn();
const dependencies = {
  createClient: createClientMock,
} as unknown as FinanceDependencies;

function setup(resolver?: QueryResolver) {
  const fake = createFakeSupabase(
    resolver ??
      ((query) => {
        if (query.table === "finance_runtime_config") {
          return { data: { value: STORED_SECRET } };
        }
        if (query.table === "user_roles") return { data: { role: "admin" } };
        return { data: null };
      }),
  );
  createClientMock.mockReturnValue(fake.client);
  return fake;
}

function request(headers: Record<string, string>) {
  return new Request("https://example.test/function", { method: "POST", headers });
}

describe("requireFinanceAuth", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", { env: { get: vi.fn((key: string) => env[key]) } });
    createClientMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // (a) criterio: sem Authorization e sem segredo => 401
  it("nega com 401 quando não há credencial alguma", async () => {
    const fake = setup();

    const result = await requireFinanceAuth({ req: request({}) }, dependencies);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    await expect((result as Response).json()).resolves.toEqual({ error: "Unauthorized" });
    // Não vaza existência de dados: nem consultou o banco.
    expect(fake.queries).toHaveLength(0);
  });

  // (b) criterio: segredo errado => 401
  it("nega com 401 segredo de cron com formato válido mas valor errado", async () => {
    setup();

    const result = await requireFinanceAuth(
      { req: request({ "x-finance-cron-secret": WRONG_SECRET }) },
      dependencies,
    );

    expect((result as Response).status).toBe(401);
  });

  it("nega com 401 segredo malformado sem consultar o banco", async () => {
    const fake = setup();

    const result = await requireFinanceAuth(
      { req: request({ "x-finance-cron-secret": "não-é-hex" }) },
      dependencies,
    );

    expect((result as Response).status).toBe(401);
    expect(fake.queries).toHaveLength(0);
  });

  it("nega com 401 quando o segredo não está configurado no banco", async () => {
    setup(() => ({ data: null }));

    const result = await requireFinanceAuth(
      { req: request({ "x-finance-cron-secret": STORED_SECRET }) },
      dependencies,
    );

    expect((result as Response).status).toBe(401);
  });

  // Segredo errado não pode "cair" para outro modo de auth.
  it("não faz fallback para service_role quando o segredo enviado é inválido", async () => {
    setup();

    const result = await requireFinanceAuth(
      {
        req: request({
          "x-finance-cron-secret": WRONG_SECRET,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        }),
      },
      dependencies,
    );

    expect((result as Response).status).toBe(401);
  });

  // A1.1: header PRESENTE porem vazio/em branco tambem decide aqui — nunca
  // cai para service_role nem para staff.
  it("nega com 401 header de segredo vazio mesmo com Bearer service_role válido", async () => {
    const fake = setup();

    const result = await requireFinanceAuth(
      {
        req: request({
          "x-finance-cron-secret": "",
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        }),
      },
      dependencies,
    );

    expect((result as Response).status).toBe(401);
    // Barrado pelo formato, antes de qualquer I/O.
    expect(fake.queries).toHaveLength(0);
  });

  it("nega com 401 header de segredo em branco mesmo com JWT staff permitido", async () => {
    setup();

    const result = await requireFinanceAuth(
      {
        req: request({
          "x-finance-cron-secret": "   ",
          Authorization: "Bearer user-jwt",
        }),
        allowStaffRoles: ["admin"],
      },
      dependencies,
    );

    expect((result as Response).status).toBe(401);
  });

  // (c) criterio: service_role valido => autorizado
  it("autoriza Bearer service_role sem consultar o banco", async () => {
    const fake = setup();

    const result = await requireFinanceAuth(
      { req: request({ Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }) },
      dependencies,
    );

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({ authorized: true, mode: "service", userId: null });
    expect(fake.queries).toHaveLength(0);
  });

  // (d) criterio: segredo de cron valido => autorizado
  it("autoriza segredo de cron válido", async () => {
    const fake = setup();

    const result = await requireFinanceAuth(
      { req: request({ "x-finance-cron-secret": STORED_SECRET }) },
      dependencies,
    );

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({ authorized: true, mode: "cron", userId: null });
    expect(fake.queries[0].table).toBe("finance_runtime_config");
  });

  it("não loga o segredo recebido nem o armazenado", async () => {
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    setup(() => ({ data: null, error: { message: "permission denied" } }));

    await requireFinanceAuth(
      { req: request({ "x-finance-cron-secret": STORED_SECRET }) },
      dependencies,
    );

    const logged = [...warn.mock.calls, ...error.mock.calls].flat().join(" ");
    expect(logged).not.toContain(STORED_SECRET);
  });

  describe("modo staff", () => {
    it("rejeita JWT de usuário quando a função não declara roles (service-to-service)", async () => {
      setup();

      const result = await requireFinanceAuth(
        { req: request({ Authorization: "Bearer user-jwt" }) },
        dependencies,
      );

      expect((result as Response).status).toBe(401);
    });

    it("autoriza admin quando a função declara allowStaffRoles", async () => {
      setup();

      const result = await requireFinanceAuth(
        {
          req: request({ Authorization: "Bearer user-jwt" }),
          allowStaffRoles: ["admin"],
        },
        dependencies,
      );

      expect(result).not.toBeInstanceOf(Response);
      expect(result).toMatchObject({ authorized: true, mode: "staff" });
    });

    it("nega com 403 usuário autenticado sem a role permitida", async () => {
      setup((query) => {
        if (query.table === "user_roles") return { data: null };
        return { data: { value: STORED_SECRET } };
      });

      const result = await requireFinanceAuth(
        {
          req: request({ Authorization: "Bearer user-jwt" }),
          allowStaffRoles: ["admin"],
        },
        dependencies,
      );

      expect((result as Response).status).toBe(403);
    });
  });

  it("retorna 500 quando falta env obrigatória, sem autorizar", async () => {
    vi.stubGlobal("Deno", { env: { get: vi.fn(() => undefined) } });
    setup();

    const result = await requireFinanceAuth(
      { req: request({ Authorization: "Bearer whatever" }) },
      dependencies,
    );

    expect((result as Response).status).toBe(500);
  });
});
