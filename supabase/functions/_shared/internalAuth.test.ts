// Teste de COMPORTAMENTO da decisao de autorizacao das funcoes internas.
//
// O que se testava antes: que o texto dos sete arquivos nao continha certos
// padroes (`serviceRoleAuth.contract.test.ts`). Isso e tripwire — pega a
// reintroducao literal do bug, nao a classe dele. Este arquivo exercita a
// decisao de verdade: monta a Request, monta o banco falso, e afirma o que sai.
//
// Cada credencial e testada por presenca E por ausencia, e cada caminho de
// falha (env faltando, excecao, erro do banco, usuario sem role) e afirmado
// como NEGACAO — nao basta o caminho feliz funcionar.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  requireInternalAuth,
  type InternalAuthDependencies,
} from "./internalAuth";

const SERVICE_KEY = "service-role-key-real";
const CRON_SECRET = "cron-secret-real";

const env: Record<string, string | undefined> = {};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const createClientMock = vi.fn();
const dependencies = {
  createClient: createClientMock,
} as unknown as InternalAuthDependencies;

/**
 * Banco falso que roteia por tabela.
 *
 * `cron_secret`: valor guardado em `attendance_agent_runtime_config`.
 * `adminRole`: linha devolvida por `user_roles` (null = usuario sem role).
 */
function makeAdminClient(options: {
  cronSecret?: string | null;
  adminRole?: { role: string } | null;
  userRolesError?: { message: string };
  cronError?: { message: string };
} = {}) {
  const calls: Array<{ table: string; filters: Array<[string, string]> }> = [];

  const from = vi.fn((table: string) => {
    const record = { table, filters: [] as Array<[string, string]> };
    calls.push(record);

    const query: Record<string, unknown> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn((column: string, value: string) => {
      record.filters.push([column, value]);
      return query;
    });
    query.limit = vi.fn(() => query);
    query.maybeSingle = vi.fn(async () => {
      if (table === "attendance_agent_runtime_config") {
        if (options.cronError) {
          return { data: null, error: options.cronError };
        }
        return {
          data: options.cronSecret === undefined
            ? null
            : { value: options.cronSecret },
          error: null,
        };
      }
      if (table === "user_roles") {
        if (options.userRolesError) {
          return { data: null, error: options.userRolesError };
        }
        return { data: options.adminRole ?? null, error: null };
      }
      throw new Error(`tabela inesperada no teste: ${table}`);
    });
    return query;
  });

  return { client: { from } as never, from, calls };
}

function makeUserClient(userId: string | null = "user-123") {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    },
  };
}

function request(
  options: { bearer?: string; rawAuth?: string; cronSecret?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (options.bearer !== undefined) {
    headers.Authorization = `Bearer ${options.bearer}`;
  }
  if (options.rawAuth !== undefined) headers.Authorization = options.rawAuth;
  if (options.cronSecret !== undefined) {
    headers["x-attendance-agent-cron-secret"] = options.cronSecret;
  }
  return new Request("https://example.test/fn", { headers });
}

async function bodyOf(res: Response): Promise<unknown> {
  return JSON.parse(await res.text());
}

beforeEach(() => {
  env.SUPABASE_URL = "https://example.supabase.co";
  env.SUPABASE_ANON_KEY = "anon-key";
  env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  vi.stubGlobal("Deno", {
    env: { get: vi.fn((key: string) => env[key]) },
  });
  createClientMock.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─────────────────── Sem credencial ───────────────────

describe("sem credencial nenhuma", () => {
  it("nega com o status e a mensagem de `missing`", async () => {
    const admin = makeAdminClient();
    const result = await requireInternalAuth(
      {
        req: request(),
        adminClient: admin.client,
        corsHeaders,
        allowCronSecret: true,
        allowAdminUser: true,
        missing: { status: 401, message: "Missing Authorization" },
        insufficient: { status: 403, message: "Service-role required" },
      },
      dependencies,
    );

    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(401);
    expect(await bodyOf(res)).toEqual({ error: "Missing Authorization" });
  });

  it("usa 401/Missing Authorization como padrao quando `missing` e omitido", async () => {
    const admin = makeAdminClient();
    const res = (await requireInternalAuth(
      { req: request(), adminClient: admin.client, corsHeaders },
      dependencies,
    )) as Response;

    expect(res.status).toBe(401);
    expect(await bodyOf(res)).toEqual({ error: "Missing Authorization" });
  });

  it("devolve os headers de CORS da funcao e Content-Type JSON", async () => {
    const admin = makeAdminClient();
    const res = (await requireInternalAuth(
      { req: request(), adminClient: admin.client, corsHeaders },
      dependencies,
    )) as Response;

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "authorization, content-type",
    );
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("nao instancia client de usuario quando nao ha Authorization", async () => {
    const admin = makeAdminClient();
    await requireInternalAuth(
      {
        req: request(),
        adminClient: admin.client,
        corsHeaders,
        allowAdminUser: true,
      },
      dependencies,
    );

    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("trata Authorization que nao e Bearer como ausencia de credencial", async () => {
    const admin = makeAdminClient();
    const res = (await requireInternalAuth(
      {
        req: request({ rawAuth: `Basic ${SERVICE_KEY}` }),
        adminClient: admin.client,
        corsHeaders,
        missing: { status: 401, message: "Missing Authorization" },
        insufficient: { status: 403, message: "Service-role required" },
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(401);
  });

  it("e sensivel a caixa no prefixo Bearer (preserva o comportamento das sete)", async () => {
    const admin = makeAdminClient();
    const res = (await requireInternalAuth(
      {
        req: request({ rawAuth: `bearer ${SERVICE_KEY}` }),
        adminClient: admin.client,
        corsHeaders,
        missing: { status: 401, message: "Missing Authorization" },
        insufficient: { status: 403, message: "Service-role required" },
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(401);
  });
});

// ─────────────────── Chave de servico ───────────────────

describe("chave de servico", () => {
  it("autoriza quando o bearer E a chave de servico", async () => {
    const admin = makeAdminClient();
    const result = await requireInternalAuth(
      { req: request({ bearer: SERVICE_KEY }), adminClient: admin.client, corsHeaders },
      dependencies,
    );

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toEqual({
      authorized: true,
      via: "service_role",
      userId: null,
    });
  });

  it("nega JWT forjado que apenas se declara service_role", async () => {
    const forjado = [
      btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
      btoa(JSON.stringify({ role: "service_role", sub: "atacante" })),
      "assinatura-inventada",
    ].join(".");
    const admin = makeAdminClient();

    const res = (await requireInternalAuth(
      {
        req: request({ bearer: forjado }),
        adminClient: admin.client,
        corsHeaders,
        insufficient: { status: 403, message: "Service-role required" },
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(403);
    expect(await bodyOf(res)).toEqual({ error: "Service-role required" });
  });

  // O codigo antigo fazia `authHeader.replace("Bearer ", "")`, sem trim: com
  // dois espacos o token virava " <chave>" e era recusado. A primeira versao
  // desta extracao usou `bearerToken()`, que faz trim, e passou a ACEITAR —
  // mudanca de comportamento silenciosa numa PR que promete equivalencia.
  // O `Headers` preserva o espaco duplo (conferido), entao o caso e real.
  it("nega chave correta precedida de espaco extra, como o codigo antigo fazia", async () => {
    const admin = makeAdminClient();
    const res = (await requireInternalAuth(
      {
        req: request({ rawAuth: `Bearer  ${SERVICE_KEY}` }),
        adminClient: admin.client,
        corsHeaders,
      },
      dependencies,
    )) as Response;

    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(403);
  });

  it("nega chave correta seguida de espaco extra", async () => {
    const admin = makeAdminClient();
    const res = (await requireInternalAuth(
      {
        req: request({ rawAuth: `Bearer ${SERVICE_KEY} x` }),
        adminClient: admin.client,
        corsHeaders,
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(403);
  });

  it("nega token que e prefixo da chave", async () => {
    const admin = makeAdminClient();
    const res = (await requireInternalAuth(
      {
        req: request({ bearer: SERVICE_KEY.slice(0, -1) }),
        adminClient: admin.client,
        corsHeaders,
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(403);
  });

  // Vale para o HELPER isolado. No handler real a requisicao nem chega aqui:
  // `createClient(supabaseUrl, serviceKey)` roda antes e lanca com a chave
  // ausente, virando 500 no catch. Ou seja, ambiente sem a chave falha
  // fechado nos dois niveis — por caminhos diferentes.
  it("nega quando SUPABASE_SERVICE_ROLE_KEY nao esta no ambiente", async () => {
    env.SUPABASE_SERVICE_ROLE_KEY = undefined;
    const admin = makeAdminClient();

    const res = (await requireInternalAuth(
      { req: request({ bearer: SERVICE_KEY }), adminClient: admin.client, corsHeaders },
      dependencies,
    )) as Response;

    expect(res.status).toBe(403);
  });

  it("nao autoriza qualquer token quando a chave de servico e vazia", async () => {
    env.SUPABASE_SERVICE_ROLE_KEY = "";
    const admin = makeAdminClient();

    const res = (await requireInternalAuth(
      { req: request({ bearer: "seja-o-que-for" }), adminClient: admin.client, corsHeaders },
      dependencies,
    )) as Response;

    expect(res.status).toBe(403);
  });

  // `Headers` normaliza `"Bearer "` para `"Bearer"` (corta o espaco final), o
  // que derruba o `startsWith("Bearer ")` — entao "bearer vazio" chega como
  // ausencia de credencial, nao como token vazio. Fixado aqui porque e o unico
  // caminho em que dois valores vazios poderiam se encontrar.
  it("trata bearer vazio como ausencia de credencial, nunca como par vazio valido", async () => {
    env.SUPABASE_SERVICE_ROLE_KEY = "";
    const admin = makeAdminClient();

    const res = (await requireInternalAuth(
      { req: request({ bearer: "" }), adminClient: admin.client, corsHeaders },
      dependencies,
    )) as Response;

    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("usa 403/Service-role required como padrao de `insufficient`", async () => {
    const admin = makeAdminClient();
    const res = (await requireInternalAuth(
      { req: request({ bearer: "qualquer-coisa" }), adminClient: admin.client, corsHeaders },
      dependencies,
    )) as Response;

    expect(res.status).toBe(403);
    expect(await bodyOf(res)).toEqual({ error: "Service-role required" });
  });

  it("nao consulta user_roles quando a chave de servico ja autorizou", async () => {
    const admin = makeAdminClient({ adminRole: { role: "admin" } });
    await requireInternalAuth(
      {
        req: request({ bearer: SERVICE_KEY }),
        adminClient: admin.client,
        corsHeaders,
        allowAdminUser: true,
      },
      dependencies,
    );

    expect(admin.calls.map((c) => c.table)).not.toContain("user_roles");
  });
});

// ─────────────────── Segredo do cron ───────────────────

describe("segredo do cron", () => {
  it("autoriza sem Authorization quando o segredo confere", async () => {
    const admin = makeAdminClient({ cronSecret: CRON_SECRET });
    const result = await requireInternalAuth(
      {
        req: request({ cronSecret: CRON_SECRET }),
        adminClient: admin.client,
        corsHeaders,
        allowCronSecret: true,
      },
      dependencies,
    );

    expect(result).toEqual({
      authorized: true,
      via: "cron_secret",
      userId: null,
    });
  });

  it("autoriza mesmo com bearer invalido junto", async () => {
    const admin = makeAdminClient({ cronSecret: CRON_SECRET });
    const result = await requireInternalAuth(
      {
        req: request({ cronSecret: CRON_SECRET, bearer: "lixo" }),
        adminClient: admin.client,
        corsHeaders,
        allowCronSecret: true,
      },
      dependencies,
    );

    expect(result).toEqual({
      authorized: true,
      via: "cron_secret",
      userId: null,
    });
  });

  it("nega segredo errado", async () => {
    const admin = makeAdminClient({ cronSecret: CRON_SECRET });
    const res = (await requireInternalAuth(
      {
        req: request({ cronSecret: "chute" }),
        adminClient: admin.client,
        corsHeaders,
        allowCronSecret: true,
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(401);
  });

  it("nega quando nao ha segredo configurado no banco", async () => {
    const admin = makeAdminClient();
    const res = (await requireInternalAuth(
      {
        req: request({ cronSecret: CRON_SECRET }),
        adminClient: admin.client,
        corsHeaders,
        allowCronSecret: true,
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(401);
  });

  it("nega quando a consulta do segredo falha", async () => {
    const admin = makeAdminClient({ cronError: { message: "indisponivel" } });
    const res = (await requireInternalAuth(
      {
        req: request({ cronSecret: CRON_SECRET }),
        adminClient: admin.client,
        corsHeaders,
        allowCronSecret: true,
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(401);
  });

  it("ignora o segredo — e nao consulta o banco — quando allowCronSecret nao esta ligado", async () => {
    const admin = makeAdminClient({ cronSecret: CRON_SECRET });
    const res = (await requireInternalAuth(
      {
        req: request({ cronSecret: CRON_SECRET }),
        adminClient: admin.client,
        corsHeaders,
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(401);
    expect(admin.from).not.toHaveBeenCalled();
  });
});

// ─────────────────── Usuario admin ───────────────────

describe("usuario admin", () => {
  it("autoriza usuario com role admin e devolve o userId", async () => {
    const admin = makeAdminClient({ adminRole: { role: "admin" } });
    createClientMock.mockReturnValue(makeUserClient("user-123"));

    const result = await requireInternalAuth(
      {
        req: request({ bearer: "jwt-de-admin" }),
        adminClient: admin.client,
        corsHeaders,
        allowAdminUser: true,
      },
      dependencies,
    );

    expect(result).toEqual({
      authorized: true,
      via: "admin_user",
      userId: "user-123",
    });
  });

  it("consulta user_roles filtrando pelo usuario e pela role admin", async () => {
    const admin = makeAdminClient({ adminRole: { role: "admin" } });
    createClientMock.mockReturnValue(makeUserClient("user-123"));

    await requireInternalAuth(
      {
        req: request({ bearer: "jwt-de-admin" }),
        adminClient: admin.client,
        corsHeaders,
        allowAdminUser: true,
      },
      dependencies,
    );

    const userRoles = admin.calls.find((c) => c.table === "user_roles");
    expect(userRoles?.filters).toEqual([
      ["user_id", "user-123"],
      ["role", "admin"],
    ]);
  });

  it("repassa o Authorization original ao client do usuario", async () => {
    const admin = makeAdminClient({ adminRole: { role: "admin" } });
    createClientMock.mockReturnValue(makeUserClient());

    await requireInternalAuth(
      {
        req: request({ bearer: "jwt-de-admin" }),
        adminClient: admin.client,
        corsHeaders,
        allowAdminUser: true,
      },
      dependencies,
    );

    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      { global: { headers: { Authorization: "Bearer jwt-de-admin" } } },
    );
  });

  it("nega usuario autenticado sem role admin", async () => {
    const admin = makeAdminClient({ adminRole: null });
    createClientMock.mockReturnValue(makeUserClient("aluna-1"));

    const res = (await requireInternalAuth(
      {
        req: request({ bearer: "jwt-de-aluna" }),
        adminClient: admin.client,
        corsHeaders,
        allowAdminUser: true,
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(403);
  });

  it("nega quando o JWT nao resolve para nenhum usuario", async () => {
    const admin = makeAdminClient({ adminRole: { role: "admin" } });
    createClientMock.mockReturnValue(makeUserClient(null));

    const res = (await requireInternalAuth(
      {
        req: request({ bearer: "jwt-invalido" }),
        adminClient: admin.client,
        corsHeaders,
        allowAdminUser: true,
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(403);
    expect(admin.calls.map((c) => c.table)).not.toContain("user_roles");
  });

  it("nega quando a consulta de role devolve erro", async () => {
    const admin = makeAdminClient({ userRolesError: { message: "boom" } });
    createClientMock.mockReturnValue(makeUserClient("user-123"));

    const res = (await requireInternalAuth(
      {
        req: request({ bearer: "jwt-de-admin" }),
        adminClient: admin.client,
        corsHeaders,
        allowAdminUser: true,
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(403);
  });

  it("nega — sem propagar excecao — quando getUser lanca", async () => {
    const admin = makeAdminClient({ adminRole: { role: "admin" } });
    createClientMock.mockReturnValue({
      auth: { getUser: vi.fn().mockRejectedValue(new Error("rede caiu")) },
    });

    const res = (await requireInternalAuth(
      {
        req: request({ bearer: "jwt-de-admin" }),
        adminClient: admin.client,
        corsHeaders,
        allowAdminUser: true,
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(403);
  });

  it("nega — sem propagar excecao — quando createClient lanca", async () => {
    const admin = makeAdminClient({ adminRole: { role: "admin" } });
    createClientMock.mockImplementation(() => {
      throw new Error("anon key invalida");
    });

    const res = (await requireInternalAuth(
      {
        req: request({ bearer: "jwt-de-admin" }),
        adminClient: admin.client,
        corsHeaders,
        allowAdminUser: true,
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(403);
  });

  it("nega quando SUPABASE_ANON_KEY nao esta no ambiente", async () => {
    env.SUPABASE_ANON_KEY = undefined;
    const admin = makeAdminClient({ adminRole: { role: "admin" } });
    createClientMock.mockReturnValue(makeUserClient("user-123"));

    const res = (await requireInternalAuth(
      {
        req: request({ bearer: "jwt-de-admin" }),
        adminClient: admin.client,
        corsHeaders,
        allowAdminUser: true,
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(403);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("ignora o caminho de admin quando allowAdminUser nao esta ligado", async () => {
    const admin = makeAdminClient({ adminRole: { role: "admin" } });
    createClientMock.mockReturnValue(makeUserClient("user-123"));

    const res = (await requireInternalAuth(
      {
        req: request({ bearer: "jwt-de-admin" }),
        adminClient: admin.client,
        corsHeaders,
      },
      dependencies,
    )) as Response;

    expect(res.status).toBe(403);
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

// ─────────────── Combinacoes de opcoes ───────────────
//
// Estes testes exercitam as TRES combinacoes de `allowCronSecret`/
// `allowAdminUser` usadas pelas sete, cada uma pelo que aceita e pelo que
// recusa. Sao sobre o HELPER: nada aqui amarra uma funcao a uma combinacao.
// Quem faz essa amarracao e `serviceRoleAuth.contract.test.ts`, que le o
// codigo dos sete handlers e confere as flags e as mensagens de negacao —
// sem ele, trocar `allowAdminUser` em um handler nao quebraria teste nenhum.

describe("perfis", () => {
  const CRON_E_ADMIN = { allowCronSecret: true, allowAdminUser: true } as const;
  const SO_CRON = { allowCronSecret: true, allowAdminUser: false } as const;
  const SO_ADMIN = { allowCronSecret: false, allowAdminUser: true } as const;

  async function run(
    perfil: { allowCronSecret: boolean; allowAdminUser: boolean },
    req: Request,
    admin: ReturnType<typeof makeAdminClient>,
  ) {
    return await requireInternalAuth(
      { req, adminClient: admin.client, corsHeaders, ...perfil },
      dependencies,
    );
  }

  it("cron+admin: aceita cron, chave e admin; nega o resto", async () => {
    createClientMock.mockReturnValue(makeUserClient("user-123"));
    const cheio = () =>
      makeAdminClient({ cronSecret: CRON_SECRET, adminRole: { role: "admin" } });

    expect(
      await run(CRON_E_ADMIN, request({ cronSecret: CRON_SECRET }), cheio()),
    ).toMatchObject({ via: "cron_secret" });
    expect(
      await run(CRON_E_ADMIN, request({ bearer: SERVICE_KEY }), cheio()),
    ).toMatchObject({ via: "service_role" });
    expect(
      await run(CRON_E_ADMIN, request({ bearer: "jwt-de-admin" }), cheio()),
    ).toMatchObject({ via: "admin_user" });

    const semRole = makeAdminClient({ cronSecret: CRON_SECRET, adminRole: null });
    expect(
      await run(CRON_E_ADMIN, request({ bearer: "jwt-de-aluna" }), semRole),
    ).toBeInstanceOf(Response);
  });

  it("so cron: aceita cron e chave; nega admin", async () => {
    createClientMock.mockReturnValue(makeUserClient("user-123"));
    const cheio = () =>
      makeAdminClient({ cronSecret: CRON_SECRET, adminRole: { role: "admin" } });

    expect(
      await run(SO_CRON, request({ cronSecret: CRON_SECRET }), cheio()),
    ).toMatchObject({ via: "cron_secret" });
    expect(
      await run(SO_CRON, request({ bearer: SERVICE_KEY }), cheio()),
    ).toMatchObject({ via: "service_role" });
    expect(
      await run(SO_CRON, request({ bearer: "jwt-de-admin" }), cheio()),
    ).toBeInstanceOf(Response);
  });

  it("so admin: aceita chave e admin; nega cron", async () => {
    createClientMock.mockReturnValue(makeUserClient("user-123"));
    const cheio = () =>
      makeAdminClient({ cronSecret: CRON_SECRET, adminRole: { role: "admin" } });

    expect(
      await run(SO_ADMIN, request({ bearer: SERVICE_KEY }), cheio()),
    ).toMatchObject({ via: "service_role" });
    expect(
      await run(SO_ADMIN, request({ bearer: "jwt-de-admin" }), cheio()),
    ).toMatchObject({ via: "admin_user" });
    expect(
      await run(SO_ADMIN, request({ cronSecret: CRON_SECRET }), cheio()),
    ).toBeInstanceOf(Response);
  });
});
