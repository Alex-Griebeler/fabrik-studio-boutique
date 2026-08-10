import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALLOWED_BANK_ROLES,
  MAX_FILE_CONTENT_CHARS,
  MAX_REQUEST_BYTES,
  isBankRequestError,
  parseBankStatementRequest,
  parseMatchRequest,
  requestTooLarge,
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

  // A7 do plano 2c: manager saiu na 2c-1 (revisão fria vetou ampliar a
  // superfície financeira a um papel sem uso em produção).
  it("aceita exatamente admin", () => {
    expect([...ALLOWED_BANK_ROLES]).toEqual(["admin"]);
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

  // O filtro de role é a PRÓPRIA query (in("role", allowed)): um manager real
  // não devolve linha nenhuma quando a allowlist é só admin — o fake retorna
  // null exatamente como o banco retornaria.
  it("nega manager com 403 — conciliação é admin-only desde a 2c-1", async () => {
    setup(null);

    const result = await requireBankStaff(request("jwt-manager"), dependencies);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("consulta user_roles restringindo às roles bancárias", async () => {
    const { query } = setup({ role: "admin" });

    await requireBankStaff(request("jwt-admin"), dependencies);

    expect(query.in).toHaveBeenCalledWith("role", ["admin"]);
  });

  // Não há cron nem edge function chamando estas duas; sem caso de uso
  // interno, o bearer de service_role não é aceito — e assim toda conciliação
  // e toda importação ficam com autor humano registrado.
  it("nega service_role: sem chamador interno, o bearer não é aceito", async () => {
    setup(null);

    const result = await requireBankStaff(
      request(env.SUPABASE_SERVICE_ROLE_KEY),
      dependencies,
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
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

describe("requestTooLarge", () => {
  function withLength(value?: string) {
    return new Request("https://example.test/f", {
      method: "POST",
      headers: value === undefined ? {} : { "content-length": value },
      body: "{}",
    });
  }

  it("barra corpo declarado acima do teto", () => {
    expect(requestTooLarge(withLength(String(MAX_REQUEST_BYTES + 1)))).toBe(true);
  });

  it("deixa passar corpo no limite", () => {
    expect(requestTooLarge(withLength(String(MAX_REQUEST_BYTES)))).toBe(false);
  });

  it("deixa passar payload normal", () => {
    expect(requestTooLarge(withLength("2048"))).toBe(false);
  });

  // Sem header confiável, a checagem por campo (413 em parseBankStatementRequest)
  // continua sendo a rede de segurança.
  it.each([
    ["header ausente", undefined],
    ["header vazio", ""],
    ["header não numérico", "muito-grande"],
  ])("não bloqueia com %s", (_label, value) => {
    expect(requestTooLarge(withLength(value))).toBe(false);
  });
});

describe("parseMatchRequest", () => {
  it("usa o import_id enviado pelo frontend", () => {
    expect(parseMatchRequest({ import_id: "imp-1" }))
      .toEqual({ importId: "imp-1" });
  });

  it.each([
    ["ausente", {}],
    ["explicitamente nulo", { import_id: null }],
  ])("trata import_id %s como varredura completa", (_label, body) => {
    expect(parseMatchRequest(body)).toEqual({ importId: null });
  });

  // Onda 2c-1: auto_apply deixou de existir. O único valor que um dia
  // aplicou (o booleano literal true) vira ERRO explícito — cliente antigo
  // pedindo aplicação precisa descobrir que o contrato mudou.
  it("rejeita auto_apply true com 400", () => {
    const result = parseMatchRequest({ auto_apply: true });

    expect(isBankRequestError(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { error: string }).error).toContain("auto_apply");
  });

  // Os demais valores nunca aplicaram nada — seguem sendo sugestão normal,
  // sem quebrar cliente que mandava auto_apply: false.
  it.each([
    ["string 'true'", "true"],
    ["string 'false'", "false"],
    ["false literal", false],
    ["número 1", 1],
    ["objeto", {}],
    ["ausente", undefined],
  ])("auto_apply %s segue como sugestão normal", (_label, value) => {
    const result = parseMatchRequest({ auto_apply: value });

    expect(isBankRequestError(result)).toBe(false);
    expect(result).toEqual({ importId: null });
  });

  // Normalizar id inválido para null seria varredura global — o oposto do
  // que quem enviou o filtro pediu.
  it.each([
    ["import_id vazio", ""],
    ["import_id numérico", 42],
    ["import_id objeto", { id: "x" }],
    ["import_id array", ["imp-1"]],
    ["import_id booleano", true],
  ])("rejeita %s com 400 em vez de virar varredura global", (_label, value) => {
    const result = parseMatchRequest({ import_id: value });

    expect(isBankRequestError(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it("aceita corpo inválido sem quebrar, no modo mais restrito", () => {
    expect(parseMatchRequest("nada")).toEqual({ importId: null });
  });
});
