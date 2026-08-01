import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  requireStaffRole,
  type RequireStaffRoleDependencies,
} from "./requireStaffRole";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const createClientMock = vi.fn();

const dependencies = {
  createClient: createClientMock,
} as unknown as RequireStaffRoleDependencies;

function makeAdminClient(roleRow: { role: string } | null) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue({
    data: roleRow,
    error: null,
  });

  return {
    client: { from: vi.fn(() => query) },
    query,
  };
}

function makeUserClient(userId = "user-123") {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: userId } },
        error: null,
      }),
    },
  };
}

function request(token?: string) {
  return new Request("https://example.test/function", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

describe("requireStaffRole", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: keyof typeof env) => env[key]) },
    });
    createClientMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("autoriza usuário com uma das roles permitidas", async () => {
    const admin = makeAdminClient({ role: "admin" });
    const user = makeUserClient();
    createClientMock
      .mockReturnValueOnce(admin.client)
      .mockReturnValueOnce(user);

    const result = await requireStaffRole(
      {
        req: request("valid-user-jwt"),
        allowed: ["admin", "manager"],
      },
      dependencies,
    );

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({
      authorized: true,
      service: false,
      userId: "user-123",
    });
    expect(admin.client.from).toHaveBeenCalledWith("user_roles");
    expect(admin.query.in).toHaveBeenCalledWith("role", ["admin", "manager"]);
  });

  it("nega com 403 usuário sem role permitida", async () => {
    const admin = makeAdminClient(null);
    createClientMock
      .mockReturnValueOnce(admin.client)
      .mockReturnValueOnce(makeUserClient());

    const result = await requireStaffRole(
      {
        req: request("valid-user-jwt"),
        allowed: ["admin"],
      },
      dependencies,
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    await expect((result as Response).json()).resolves.toEqual({
      error: "Forbidden",
    });
  });

  it("nega com 401 quando não há Bearer", async () => {
    const result = await requireStaffRole(
      {
        req: request(),
        allowed: ["admin"],
      },
      dependencies,
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("aceita service_role sem consultar user_roles", async () => {
    const admin = makeAdminClient(null);
    createClientMock.mockReturnValueOnce(admin.client);

    const result = await requireStaffRole(
      {
        req: request(env.SUPABASE_SERVICE_ROLE_KEY),
        allowed: ["admin"],
      },
      dependencies,
    );

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({
      authorized: true,
      service: true,
      userId: null,
    });
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(admin.client.from).not.toHaveBeenCalled();
  });

  // Config usada por emit-nfse: bearer service_role NÃO pode virar
  // atalho de admin; cai na validação de JWT e é rejeitado.
  it("não aplica bypass quando allowServiceRole é false", async () => {
    const admin = makeAdminClient(null);
    const user = makeUserClient();
    user.auth.getClaims.mockResolvedValue({ data: null, error: null });
    createClientMock
      .mockReturnValueOnce(admin.client)
      .mockReturnValueOnce(user);

    const result = await requireStaffRole(
      {
        req: request(env.SUPABASE_SERVICE_ROLE_KEY),
        allowed: ["admin", "manager"],
        allowServiceRole: false,
      },
      dependencies,
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    expect(user.auth.getClaims).toHaveBeenCalledWith(
      env.SUPABASE_SERVICE_ROLE_KEY,
    );
  });
});
