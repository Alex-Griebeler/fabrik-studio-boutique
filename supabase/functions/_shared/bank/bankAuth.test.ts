import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALLOWED_BANK_ROLES,
  MAX_FILE_CONTENT_CHARS,
  isBankRequestError,
  parseBankStatementRequest,
  parseMatchRequest,
  requireBankStaff,
  type BankDependencies,
} from "./bankAuth";

const env: Record<string, string | undefined> = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const createClientMock = vi.fn();
const dependencies = { createClient: createClientMock } as unknown as BankDependencies;

/** Client fake: resolve a role do usuário e registra o que foi consultado. */
function setup(roleRow: { role: string } | null) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue({ data: roleRow, error: null });

  const client = {
    from: vi.fn(() => query),
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: "user-123" } },
        error: null,
      }),
    },
  };

  createClientMock.mockReturnValue(client);
  return { client, query };
}

function request(token?: string) {
  return new Request("https://example.test/function", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

describe("requireBankStaff", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", { env: { get: vi.fn((key: string) => env[key]) } });
    createClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("aceita exatamente admin e manager", () => {
    expect([...ALLOWED_BANK_ROLES]).toEqual(["admin", "manager"]);
  });

  it("nega com 401 quando não há credencial alguma", async () => {
    setup(null);

    const result = await requireBankStaff(request(), dependencies);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  // O buraco que esta PR fecha: JWT de aluno é emitido legitimamente pelo app.
  it("nega com 403 JWT de usuário sem role de staff (ex.: aluno)", async () => {
    setup(null);

    const result = await requireBankStaff(request("jwt-de-aluno"), dependencies);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("autoriza admin", async () => {
    setup({ role: "admin" });

    const result = await requireBankStaff(request("jwt-admin"), dependencies);

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({ authorized: true, userId: "user-123" });
  });

  it("autoriza manager", async () => {
    setup({ role: "manager" });

    const result = await requireBankStaff(request("jwt-manager"), dependencies);

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({ authorized: true });
  });

  it("consulta user_roles restringindo às roles bancárias", async () => {
    const { query } = setup({ role: "manager" });

    await requireBankStaff(request("jwt-manager"), dependencies);

    expect(query.in).toHaveBeenCalledWith("role", ["admin", "manager"]);
  });

  it("autoriza chamada interna com service_role", async () => {
    setup(null);

    const result = await requireBankStaff(
      request(env.SUPABASE_SERVICE_ROLE_KEY),
      dependencies,
    );

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({ authorized: true, service: true });
  });
});

describe("parseBankStatementRequest", () => {
  const valid = {
    fileContent: "conteudo",
    fileName: "extrato.ofx",
    fileType: "ofx",
  };

  it("aceita o payload real do frontend", () => {
    const result = parseBankStatementRequest({ ...valid, forceImport: false });

    expect(isBankRequestError(result)).toBe(false);
    expect(result).toEqual({
      fileContent: "conteudo",
      fileName: "extrato.ofx",
      fileType: "ofx",
      forceImport: false,
    });
  });

  // Regressão direta do bug `body.forceImport` com `body` fora de escopo:
  // o corpo agora é lido uma vez só e forceImport sai daí.
  it("lê forceImport do mesmo corpo, sem variável solta", () => {
    const result = parseBankStatementRequest({ ...valid, forceImport: true });

    expect(isBankRequestError(result)).toBe(false);
    expect((result as { forceImport: boolean }).forceImport).toBe(true);
  });

  it.each([
    ["string 'true'", "true"],
    ["número 1", 1],
    ["ausente", undefined],
    ["null", null],
  ])("só o booleano true liga forceImport (%s não liga)", (_label, value) => {
    const result = parseBankStatementRequest({ ...valid, forceImport: value });

    expect((result as { forceImport: boolean }).forceImport).toBe(false);
  });

  it.each([
    ["ofx", "ofx"],
    ["csv", "csv"],
    ["xlsx", "xlsx"],
    ["xls", "xls"],
  ])("mantém o formato suportado %s", (_label, fileType) => {
    const result = parseBankStatementRequest({ ...valid, fileType });

    expect(isBankRequestError(result)).toBe(false);
  });

  it.each([
    ["formato desconhecido", { ...valid, fileType: "pdf" }, 400],
    ["sem fileType", { fileContent: "x", fileName: "y" }, 400],
    ["sem fileContent", { fileName: "y", fileType: "ofx" }, 400],
    ["fileContent vazio", { ...valid, fileContent: "" }, 400],
    ["sem fileName", { fileContent: "x", fileType: "ofx" }, 400],
    ["corpo não-objeto", "extrato", 400],
    ["corpo nulo", null, 400],
  ])("rejeita %s", (_label, body, status) => {
    const result = parseBankStatementRequest(body);

    expect(isBankRequestError(result)).toBe(true);
    expect((result as { status: number }).status).toBe(status);
  });

  it("rejeita arquivo acima do teto antes de qualquer parse", () => {
    const result = parseBankStatementRequest({
      ...valid,
      fileContent: "a".repeat(MAX_FILE_CONTENT_CHARS + 1),
    });

    expect(isBankRequestError(result)).toBe(true);
    expect((result as { status: number }).status).toBe(413);
  });
});

describe("parseMatchRequest", () => {
  it("usa os valores enviados pelo frontend", () => {
    expect(parseMatchRequest({ import_id: "imp-1", auto_apply: true }))
      .toEqual({ importId: "imp-1", autoApply: true });
  });

  it("trata import_id ausente como varredura completa", () => {
    expect(parseMatchRequest({ auto_apply: false }))
      .toEqual({ importId: null, autoApply: false });
  });

  // auto_apply grava e não tem desfazer: só o booleano literal liga.
  it.each([
    ["string 'true'", "true"],
    ["string 'false'", "false"],
    ["número 1", 1],
    ["objeto", {}],
    ["ausente", undefined],
  ])("só o booleano true liga autoApply (%s não liga)", (_label, value) => {
    expect(parseMatchRequest({ auto_apply: value }).autoApply).toBe(false);
  });

  it.each([
    ["import_id vazio", ""],
    ["import_id numérico", 42],
    ["import_id nulo", null],
  ])("normaliza %s para null", (_label, value) => {
    expect(parseMatchRequest({ import_id: value }).importId).toBeNull();
  });

  it("aceita corpo inválido sem quebrar, no modo mais restrito", () => {
    expect(parseMatchRequest("nada")).toEqual({ importId: null, autoApply: false });
  });
});
