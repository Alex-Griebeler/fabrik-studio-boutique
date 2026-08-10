import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canonicalFingerprint,
  handleManageTeam,
  withTimeout,
  LIST_MAX_PAGES,
  LIST_PER_PAGE,
  normalizeEmail,
  type ManageTeamDependencies,
  type TeamAuthAdminApi,
} from "./manageTeam";

const env: Record<string, string | undefined> = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  APP_URL: "https://app.example.com",
};

const OP_ID = "11111111-2222-3333-4444-555555555555";
const TARGET = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ACTOR = "user-for-jwt-admin";

// ── Fake propositado: from() p/ role-check e lookups; rpc() ROTEIRIZADO ──────

interface RpcCall { name: string; args: Record<string, unknown> }

function makeFake(options: {
  actorRole?: string | null;
  rpcScript?: (call: RpcCall) => { data?: unknown; error?: { code?: string; message?: string } | null };
} = {}) {
  const rpcCalls: RpcCall[] = [];
  const startedOp = (over: Record<string, unknown> = {}) => ({
    kind: "new",
    lease_token: "lease-1",
    op: {
      operation_id: OP_ID, status: "started", outcome: null, phase: "preflight",
      target_user_id: null, error_code: null, detail: {}, ...over,
    },
  });

  const defaultScript = (call: RpcCall) => {
    if (call.name === "team_begin_operation") return { data: startedOp() };
    if (call.name === "team_finalize_operation") {
      return {
        data: {
          operation_id: OP_ID,
          status: call.args.p_status, outcome: call.args.p_outcome,
          phase: "done", target_user_id: null,
          error_code: call.args.p_error_code ?? null,
          detail: (call.args.p_detail_patch as Record<string, unknown>) ?? {},
        },
      };
    }
    if (call.name === "team_set_roles" || call.name === "team_revoke_access") {
      return { data: { user_id: call.args.p_target, roles: ["instructor"] } };
    }
    return { data: null };
  };

  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => { filters[col] = val; return builder; },
        in: (col: string, vals: unknown[]) => { filters[col] = vals; return builder; },
        limit: () => builder,
        maybeSingle: () => {
          if (table === "user_roles") {
            const role = options.actorRole === undefined ? "admin" : options.actorRole;
            const allowed = (filters.role as string[] | undefined) ?? [];
            return Promise.resolve({
              data: role && allowed.includes(role) ? { role } : null,
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(onFulfilled?: (v: unknown) => unknown) {
          // lookups de list (profiles / user_roles em lote)
          if (table === "profiles") {
            return Promise.resolve({ data: [], error: null }).then(onFulfilled);
          }
          if (table === "user_roles") {
            return Promise.resolve({ data: [], error: null }).then(onFulfilled);
          }
          return Promise.resolve({ data: null, error: null }).then(onFulfilled);
        },
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      const call = { name, args };
      rpcCalls.push(call);
      const result = (options.rpcScript ?? defaultScript)(call) ?? {};
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    },
    auth: {
      getClaims: (token: string) =>
        Promise.resolve({ data: { claims: { sub: `user-for-${token}` } }, error: null }),
    },
  };

  return { client, rpcCalls };
}

function makeAuthAdmin(options: {
  users?: Array<Record<string, unknown>>;
  pages?: Array<Array<Record<string, unknown>>>;
  listError?: boolean;
  inviteUser?: Record<string, unknown> | null;
  inviteError?: boolean;
  updateError?: boolean;
  rereadUser?: Record<string, unknown> | null;
} = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const invitedUser = options.inviteUser === undefined
    ? { id: TARGET, email: "nova@fabrik.com", app_metadata: {} }
    : options.inviteUser;

  const api: TeamAuthAdminApi = {
    listUsers: ({ page, perPage }) => {
      calls.push({ method: "listUsers", args: [page, perPage] });
      if (options.listError) return Promise.resolve({ data: null, error: { message: "boom" } });
      if (options.pages) {
        const users = options.pages[page - 1] ?? [];
        return Promise.resolve({ data: { users: users as never }, error: null });
      }
      const users = page === 1 ? (options.users ?? []) : [];
      return Promise.resolve({ data: { users: users as never }, error: null });
    },
    inviteUserByEmail: (email, opts) => {
      calls.push({ method: "inviteUserByEmail", args: [email, opts] });
      if (options.inviteError) return Promise.resolve({ data: null, error: { message: "smtp" } });
      return Promise.resolve({ data: { user: invitedUser as never }, error: null });
    },
    updateUserById: (id, attrs) => {
      calls.push({ method: "updateUserById", args: [id, attrs] });
      if (options.updateError) return Promise.resolve({ data: null, error: { message: "nope" } });
      return Promise.resolve({ data: { user: invitedUser as never }, error: null });
    },
    getUserById: (id) => {
      calls.push({ method: "getUserById", args: [id] });
      const user = options.rereadUser === undefined
        ? { ...invitedUser, app_metadata: { team_operation_id: OP_ID } }
        : options.rereadUser;
      return Promise.resolve({ data: user ? { user: user as never } : { user: null }, error: null });
    },
  };
  return { api, calls };
}

function makeDeps(
  fake: ReturnType<typeof makeFake>,
  authAdmin: TeamAuthAdminApi,
  sendRecovery = vi.fn().mockResolvedValue({ error: null }),
): { deps: ManageTeamDependencies; sendRecovery: ReturnType<typeof vi.fn> } {
  const createClientMock = vi.fn().mockReturnValue(fake.client);
  return {
    deps: {
      createClient: createClientMock,
      getAuthAdmin: () => authAdmin,
      getRpcClient: () => fake.client,
      sendRecoveryEmail: sendRecovery,
      getAppUrl: () => env.APP_URL,
    } as unknown as ManageTeamDependencies,
    sendRecovery,
  };
}

function request(body: unknown, token = "jwt-admin") {
  return new Request("https://example.test/manage-team", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("handleManageTeam", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", { env: { get: vi.fn((key: string) => env[key]) } });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("envelope e autorização", () => {
    it("OPTIONS responde 200 antes de auth", async () => {
      const fake = makeFake();
      const { deps } = makeDeps(fake, makeAuthAdmin().api);
      const res = await handleManageTeam(
        new Request("https://example.test/f", { method: "OPTIONS" }), deps);
      expect(res.status).toBe(200);
    });

    it("método não-POST responde 405", async () => {
      const fake = makeFake();
      const { deps } = makeDeps(fake, makeAuthAdmin().api);
      const res = await handleManageTeam(
        new Request("https://example.test/f", { method: "GET" }), deps);
      expect(res.status).toBe(405);
    });

    it("sem credencial responde 401", async () => {
      const fake = makeFake();
      const { deps } = makeDeps(fake, makeAuthAdmin().api);
      const res = await handleManageTeam(
        new Request("https://example.test/f", { method: "POST", body: "{}" }), deps);
      expect(res.status).toBe(401);
      expect(fake.rpcCalls).toHaveLength(0);
    });

    it.each(["manager", "reception", "instructor", "student"])(
      "%s recebe 403 — a tela é admin-only",
      async (role) => {
        const fake = makeFake({ actorRole: role });
        const { deps } = makeDeps(fake, makeAuthAdmin().api);
        const res = await handleManageTeam(request({ action: "list" }, `jwt-${role}`), deps);
        expect(res.status).toBe(403);
        expect(fake.rpcCalls).toHaveLength(0);
      },
    );

    it("JSON inválido responde 400 bad_json", async () => {
      const fake = makeFake();
      const { deps } = makeDeps(fake, makeAuthAdmin().api);
      const res = await handleManageTeam(new Request("https://example.test/f", {
        method: "POST",
        headers: { Authorization: "Bearer jwt-admin" },
        body: "nada-de-json",
      }), deps);
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ error_code: "bad_json" });
    });

    it("ação desconhecida responde 400", async () => {
      const fake = makeFake();
      const { deps } = makeDeps(fake, makeAuthAdmin().api);
      const res = await handleManageTeam(request({ action: "hack" }), deps);
      await expect(res.json()).resolves.toMatchObject({ error_code: "unknown_action" });
    });

    it("mutação sem operation_id uuid responde 400", async () => {
      const fake = makeFake();
      const { deps } = makeDeps(fake, makeAuthAdmin().api);
      const res = await handleManageTeam(
        request({ action: "set_roles", operation_id: "42", user_id: TARGET, roles: ["admin"] }), deps);
      await expect(res.json()).resolves.toMatchObject({ error_code: "bad_operation_id" });
    });
  });

  describe("invite — sequência de proveniência (7 passos)", () => {
    function inviteBody() {
      return { action: "invite", operation_id: OP_ID, email: " Nova@Fabrik.com ", full_name: " Nova Colab ", role: "instructor" };
    }

    it("caminho feliz: ordem exata das chamadas e marca em app_metadata", async () => {
      const fake = makeFake();
      const admin = makeAuthAdmin();
      const { deps } = makeDeps(fake, admin.api);

      const res = await handleManageTeam(request(inviteBody()), deps);

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        status: "succeeded", outcome: "invited_with_role",
      });

      // Admin API na ordem: pre-check (listUsers), invite, update (marca), reread.
      const methods = admin.calls.map((c) => c.method);
      expect(methods).toEqual(["listUsers", "inviteUserByEmail", "updateUserById", "getUserById"]);

      // A marca vai em app_metadata; o `data` do convite leva SÓ full_name
      // (user_metadata é forjável — nunca é prova).
      const inviteArgs = admin.calls[1].args[1] as { data: Record<string, unknown>; redirectTo: string };
      expect(inviteArgs.data).toEqual({ full_name: "Nova Colab" });
      expect(inviteArgs.redirectTo).toBe("https://app.example.com/reset-password");
      const updateArgs = admin.calls[2].args[1] as { app_metadata: Record<string, unknown> };
      expect(updateArgs.app_metadata.team_operation_id).toBe(OP_ID);

      // RPCs: begin → advance(invite_requested) → advance(target) →
      // advance(auth_user_observed) → assign → finalize(succeeded).
      const rpcNames = fake.rpcCalls.map((c) => c.name);
      expect(rpcNames).toEqual([
        "team_begin_operation", "team_advance_phase", "team_advance_phase",
        "team_advance_phase", "team_assign_role_after_invite", "team_finalize_operation",
      ]);
      expect(fake.rpcCalls[5].args).toMatchObject({ p_status: "succeeded", p_outcome: "invited_with_role" });

      // Binding (R1 da rodada 1 do Codex): o assign NÃO recebe ator/alvo —
      // ambos vêm da operação registrada no banco.
      const assign = fake.rpcCalls[4];
      expect(Object.keys(assign.args).sort()).toEqual(["p_lease_token", "p_operation_id", "p_role"]);
    });

    it.each([
      ["confirmado", { id: "u1", email: "nova@fabrik.com", email_confirmed_at: "2026-01-01" }, "already_active_user"],
      ["convidado pendente", { id: "u1", email: "nova@fabrik.com", invited_at: "2026-01-01" }, "already_pending_invite"],
      ["não-confirmado sem convite", { id: "u1", email: "nova@fabrik.com" }, "already_unconfirmed_user"],
    ])("e-mail existente (%s) NUNCA ganha papel: outcome %s", async (_l, user, outcome) => {
      const fake = makeFake();
      const admin = makeAuthAdmin({ users: [user] });
      const { deps } = makeDeps(fake, admin.api);

      const res = await handleManageTeam(request(inviteBody()), deps);

      await expect(res.json()).resolves.toMatchObject({ status: "succeeded", outcome });
      expect(admin.calls.some((c) => c.method === "inviteUserByEmail")).toBe(false);
      expect(fake.rpcCalls.some((c) => c.name === "team_assign_role_after_invite")).toBe(false);
    });

    it("verificação da marca falha → partial invited_without_role SEM papel", async () => {
      const fake = makeFake();
      const admin = makeAuthAdmin({ rereadUser: { id: TARGET, app_metadata: {} } });
      const { deps } = makeDeps(fake, admin.api);

      const res = await handleManageTeam(request(inviteBody()), deps);

      await expect(res.json()).resolves.toMatchObject({
        status: "partial", outcome: "invited_without_role", recoverable: true,
      });
      expect(fake.rpcCalls.some((c) => c.name === "team_assign_role_after_invite")).toBe(false);
    });

    it("papel recusado (ator rebaixado, T0004) → partial mas FINALIZA", async () => {
      const fake = makeFake({
        rpcScript: (call) => {
          if (call.name === "team_assign_role_after_invite") {
            return { error: { code: "T0004", message: "x" } };
          }
          return undefined as never;
        },
      });
      // rpcScript acima devolve undefined pros demais → cai no default? Não:
      // makeFake usa options.rpcScript ?? default; então roteirizamos tudo:
      const fake2 = makeFake({
        rpcScript: (call) => {
          if (call.name === "team_begin_operation") {
            return { data: { kind: "new", lease_token: "lease-1", op: { operation_id: OP_ID, status: "started", outcome: null, phase: "preflight", target_user_id: null, error_code: null, detail: {} } } };
          }
          if (call.name === "team_assign_role_after_invite") {
            return { error: { code: "T0004", message: "x" } };
          }
          if (call.name === "team_finalize_operation") {
            return { data: { operation_id: OP_ID, status: call.args.p_status, outcome: call.args.p_outcome, phase: "done", target_user_id: TARGET, error_code: call.args.p_error_code ?? null, detail: (call.args.p_detail_patch as Record<string, unknown>) ?? {} } };
          }
          return { data: null };
        },
      });
      void fake;
      const admin = makeAuthAdmin();
      const { deps } = makeDeps(fake2, admin.api);

      const res = await handleManageTeam(request(inviteBody()), deps);

      await expect(res.json()).resolves.toMatchObject({
        status: "partial", outcome: "invited_without_role",
      });
      const fin = fake2.rpcCalls.find((c) => c.name === "team_finalize_operation");
      expect(fin?.args).toMatchObject({ p_error_code: "actor_not_admin" });
    });

    it("replay devolve o terminal armazenado sem NENHUM side effect", async () => {
      const fake = makeFake({
        rpcScript: (call) => {
          if (call.name === "team_begin_operation") {
            return { data: { kind: "replay", op: { operation_id: OP_ID, status: "succeeded", outcome: "invited_with_role", phase: "done", target_user_id: TARGET, error_code: null, detail: {} } } };
          }
          return { data: null };
        },
      });
      const admin = makeAuthAdmin();
      const { deps } = makeDeps(fake, admin.api);

      const res = await handleManageTeam(request(inviteBody()), deps);

      await expect(res.json()).resolves.toMatchObject({ status: "succeeded", outcome: "invited_with_role" });
      expect(admin.calls).toHaveLength(0);
      expect(fake.rpcCalls.map((c) => c.name)).toEqual(["team_begin_operation"]);
    });

    it("retry com operação em andamento (T0010) vira 202", async () => {
      const fake = makeFake({
        rpcScript: () => ({ error: { code: "T0010", message: "andamento" } }),
      });
      const { deps } = makeDeps(fake, makeAuthAdmin().api);

      const res = await handleManageTeam(request(inviteBody()), deps);

      expect(res.status).toBe(202);
      await expect(res.json()).resolves.toMatchObject({ error_code: "operation_in_progress" });
    });
  });

  describe("invite — reconciliação de takeover (NUNCA reenvia e-mail)", () => {
    function takeoverFake(phase: string, script?: (c: RpcCall) => { data?: unknown; error?: { code?: string } } | undefined) {
      return makeFake({
        rpcScript: (call) => {
          if (call.name === "team_begin_operation") {
            return { data: { kind: "takeover", lease_token: "lease-2", op: { operation_id: OP_ID, status: "started", outcome: null, phase, target_user_id: null, error_code: null, detail: {} } } };
          }
          const custom = script?.(call);
          if (custom) return custom;
          if (call.name === "team_finalize_operation") {
            return { data: { operation_id: OP_ID, status: call.args.p_status, outcome: call.args.p_outcome, phase: "done", target_user_id: null, error_code: call.args.p_error_code ?? null, detail: {} } };
          }
          return { data: null };
        },
      });
    }
    const body = { action: "invite", operation_id: OP_ID, email: "nova@fabrik.com", full_name: "Nova", role: "instructor" };

    it("usuário nascido DESTA operação (marca confere) → completa papel e sucede", async () => {
      const fake = takeoverFake("invite_requested");
      const admin = makeAuthAdmin({
        users: [{ id: TARGET, email: "nova@fabrik.com", app_metadata: { team_operation_id: OP_ID } }],
      });
      const { deps } = makeDeps(fake, admin.api);

      const res = await handleManageTeam(request(body), deps);

      await expect(res.json()).resolves.toMatchObject({ status: "succeeded", outcome: "invited_with_role" });
      expect(admin.calls.some((c) => c.method === "inviteUserByEmail")).toBe(false);
      expect(fake.rpcCalls.some((c) => c.name === "team_assign_role_after_invite")).toBe(true);
    });

    it("usuário SEM a marca → already_*, sem papel", async () => {
      const fake = takeoverFake("invite_requested");
      const admin = makeAuthAdmin({
        users: [{ id: "outro", email: "nova@fabrik.com", email_confirmed_at: "2026-01-01" }],
      });
      const { deps } = makeDeps(fake, admin.api);

      const res = await handleManageTeam(request(body), deps);

      await expect(res.json()).resolves.toMatchObject({ outcome: "already_active_user" });
      expect(fake.rpcCalls.some((c) => c.name === "team_assign_role_after_invite")).toBe(false);
    });

    it("usuário ausente → failed, e-mail NÃO é reenviado", async () => {
      const fake = takeoverFake("invite_requested");
      const admin = makeAuthAdmin({ users: [] });
      const { deps } = makeDeps(fake, admin.api);

      const res = await handleManageTeam(request(body), deps);

      await expect(res.json()).resolves.toMatchObject({ status: "failed", outcome: "invite_failed" });
      expect(admin.calls.some((c) => c.method === "inviteUserByEmail")).toBe(false);
    });
  });

  describe("set_roles / revoke_access", () => {
    it("valida: lista vazia → use_revoke_access", async () => {
      const fake = makeFake();
      const { deps } = makeDeps(fake, makeAuthAdmin().api);
      const res = await handleManageTeam(
        request({ action: "set_roles", operation_id: OP_ID, user_id: TARGET, roles: [] }), deps);
      await expect(res.json()).resolves.toMatchObject({ error_code: "use_revoke_access" });
      expect(fake.rpcCalls).toHaveLength(0);
    });

    it("valida: student na lista → student_role_untouchable, sem RPC", async () => {
      const fake = makeFake();
      const { deps } = makeDeps(fake, makeAuthAdmin().api);
      const res = await handleManageTeam(
        request({ action: "set_roles", operation_id: OP_ID, user_id: TARGET, roles: ["student"] }), deps);
      await expect(res.json()).resolves.toMatchObject({ error_code: "student_role_untouchable" });
      expect(fake.rpcCalls).toHaveLength(0);
    });

    it("caminho feliz devolve o estado final canônico", async () => {
      const fake = makeFake();
      const { deps } = makeDeps(fake, makeAuthAdmin().api);
      const res = await handleManageTeam(
        request({ action: "set_roles", operation_id: OP_ID, user_id: TARGET, roles: ["instructor", "instructor"] }), deps);
      await expect(res.json()).resolves.toMatchObject({
        status: "succeeded", outcome: "roles_set", roles: ["instructor"],
      });
    });

    it("último admin (T0003) mapeia para 409 last_admin, por CODE e não por texto", async () => {
      const fake = makeFake({
        rpcScript: (call) => {
          if (call.name === "team_begin_operation") {
            return { data: { kind: "new", lease_token: "l", op: { operation_id: OP_ID, status: "started", outcome: null, phase: "preflight", target_user_id: TARGET, error_code: null, detail: {} } } };
          }
          if (call.name === "team_set_roles") {
            return { error: { code: "T0003", message: "texto qualquer pode mudar" } };
          }
          if (call.name === "team_finalize_operation") {
            return { data: { operation_id: OP_ID, status: "failed", outcome: "rejected", phase: "done", target_user_id: TARGET, error_code: "last_admin", detail: {} } };
          }
          return { data: null };
        },
      });
      const { deps } = makeDeps(fake, makeAuthAdmin().api);
      const res = await handleManageTeam(
        request({ action: "set_roles", operation_id: OP_ID, user_id: TARGET, roles: ["manager"] }), deps);
      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toMatchObject({ error_code: "last_admin" });
      // e o registro de domínio foi finalizado como failed
      expect(fake.rpcCalls.some((c) => c.name === "team_finalize_operation")).toBe(true);
    });

    it("revoke_access feliz", async () => {
      const fake = makeFake();
      const { deps } = makeDeps(fake, makeAuthAdmin().api);
      const res = await handleManageTeam(
        request({ action: "revoke_access", operation_id: OP_ID, user_id: TARGET }), deps);
      await expect(res.json()).resolves.toMatchObject({ status: "succeeded", outcome: "access_revoked" });
    });
  });

  describe("send_recovery", () => {
    it("usuário não-confirmado → failed user_not_confirmed, sem envio", async () => {
      const fake = makeFake();
      const admin = makeAuthAdmin({ rereadUser: { id: TARGET, email: "x@y.com" } });
      const { deps, sendRecovery } = makeDeps(fake, admin.api);
      const res = await handleManageTeam(
        request({ action: "send_recovery", operation_id: OP_ID, user_id: TARGET }), deps);
      await expect(res.json()).resolves.toMatchObject({ status: "failed", outcome: "user_not_confirmed" });
      expect(sendRecovery).not.toHaveBeenCalled();
    });

    it("confirmado → advance recovery_requested + envio com redirectTo do APP_URL", async () => {
      const fake = makeFake();
      const admin = makeAuthAdmin({
        rereadUser: { id: TARGET, email: "X@Fabrik.com", email_confirmed_at: "2026-01-01" },
      });
      const { deps, sendRecovery } = makeDeps(fake, admin.api);
      const res = await handleManageTeam(
        request({ action: "send_recovery", operation_id: OP_ID, user_id: TARGET }), deps);
      await expect(res.json()).resolves.toMatchObject({ status: "succeeded", outcome: "recovery_requested" });
      expect(sendRecovery).toHaveBeenCalledWith("x@fabrik.com", "https://app.example.com/reset-password");
      expect(fake.rpcCalls.some((c) =>
        c.name === "team_advance_phase" && c.args.p_new_phase === "recovery_requested")).toBe(true);
    });

    it("cooldown (T0011) vira 429", async () => {
      const fake = makeFake({ rpcScript: () => ({ error: { code: "T0011", message: "espera" } }) });
      const { deps, sendRecovery } = makeDeps(fake, makeAuthAdmin().api);
      const res = await handleManageTeam(
        request({ action: "send_recovery", operation_id: OP_ID, user_id: TARGET }), deps);
      expect(res.status).toBe(429);
      expect(sendRecovery).not.toHaveBeenCalled();
    });

    it("takeover NUNCA reenvia: phase recovery_requested finaliza PARTIAL (resultado desconhecido)", async () => {
      const fake = makeFake({
        rpcScript: (call) => {
          if (call.name === "team_begin_operation") {
            return { data: { kind: "takeover", lease_token: "l2", op: { operation_id: OP_ID, status: "started", outcome: null, phase: "recovery_requested", target_user_id: TARGET, error_code: null, detail: {} } } };
          }
          if (call.name === "team_finalize_operation") {
            return { data: { operation_id: OP_ID, status: call.args.p_status, outcome: call.args.p_outcome, phase: "done", target_user_id: TARGET, error_code: null, detail: {} } };
          }
          return { data: null };
        },
      });
      const { deps, sendRecovery } = makeDeps(fake, makeAuthAdmin().api);
      const res = await handleManageTeam(
        request({ action: "send_recovery", operation_id: OP_ID, user_id: TARGET }), deps);
      await expect(res.json()).resolves.toMatchObject({ status: "partial", outcome: "recovery_request_unknown" });
      expect(sendRecovery).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("pagina por comprimento e para na página parcial", async () => {
      const page1 = Array.from({ length: LIST_PER_PAGE }, (_, i) => ({ id: `u${i}`, email: `u${i}@x.com` }));
      const page2 = [{ id: "final", email: "final@x.com", invited_at: "2026-01-01" }];
      const fake = makeFake();
      const admin = makeAuthAdmin({ pages: [page1, page2] });
      const { deps } = makeDeps(fake, admin.api);

      const res = await handleManageTeam(request({ action: "list" }), deps);

      const payload = await res.json();
      expect(payload.users).toHaveLength(LIST_PER_PAGE + 1);
      const pending = payload.users.find((u: { user_id: string }) => u.user_id === "final");
      expect(pending.invite_pending).toBe(true);
      expect(admin.calls.filter((c) => c.method === "listUsers")).toHaveLength(2);
    });

    it("não-confirmado SEM invited_at NÃO é convite pendente", async () => {
      const fake = makeFake();
      const admin = makeAuthAdmin({ users: [{ id: "u1", email: "a@b.com" }] });
      const { deps } = makeDeps(fake, admin.api);
      const res = await handleManageTeam(request({ action: "list" }), deps);
      const payload = await res.json();
      expect(payload.users[0].invite_pending).toBe(false);
    });

    it("teto de páginas estourado → too_many_users, sem lista parcial", async () => {
      const full = Array.from({ length: LIST_PER_PAGE }, (_, i) => ({ id: `u${i}` }));
      const fake = makeFake();
      const admin = makeAuthAdmin({ pages: Array.from({ length: LIST_MAX_PAGES + 1 }, () => full.map((u, i) => ({ id: `${u.id}-${i}` }))) });
      // páginas sempre cheias com ids repetidos por página — o que importa é o teto
      const { deps } = makeDeps(fake, admin.api);
      const res = await handleManageTeam(request({ action: "list" }), deps);
      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toMatchObject({ error_code: "too_many_users" });
    });

    it("erro em qualquer página = falha total", async () => {
      const fake = makeFake();
      const admin = makeAuthAdmin({ listError: true });
      const { deps } = makeDeps(fake, admin.api);
      const res = await handleManageTeam(request({ action: "list" }), deps);
      expect(res.status).toBe(502);
    });
  });

  describe("fingerprint e normalização", () => {
    it("requests semanticamente iguais geram o MESMO fingerprint", async () => {
      const a = await canonicalFingerprint(["invite", "x@y.com", "Nome", "instructor"]);
      const b = await canonicalFingerprint(["invite", "x@y.com", "Nome", "instructor"]);
      expect(a).toBe(b);
      const c = await canonicalFingerprint(["invite", "x@y.com", "Nome", "manager"]);
      expect(a).not.toBe(c);
    });

    it("normalizeEmail: lowercase/trim; inválido vira null", () => {
      expect(normalizeEmail(" Ana@Fabrik.COM ")).toBe("ana@fabrik.com");
      expect(normalizeEmail("sem-arroba")).toBeNull();
      expect(normalizeEmail(42)).toBeNull();
    });
  });

  describe("timeout externo (< lease; ambíguo deixa a saga started)", () => {
    it("invite que estoura o relógio → 504 external_timeout SEM finalizar", async () => {
      const fake = makeFake();
      const never = new Promise(() => {});
      const admin = makeAuthAdmin();
      const slowAdmin = { ...admin.api, inviteUserByEmail: () => never as never };
      const createClientMock = vi.fn().mockReturnValue(fake.client);
      const deps = {
        createClient: createClientMock,
        getAuthAdmin: () => slowAdmin,
        getRpcClient: () => fake.client,
        sendRecoveryEmail: vi.fn(),
        getAppUrl: () => env.APP_URL,
        externalTimeoutMs: 10,
      } as unknown as ManageTeamDependencies;

      const res = await handleManageTeam(
        request({ action: "invite", operation_id: OP_ID, email: "a@b.com", full_name: "A", role: "instructor" }),
        deps,
      );

      expect(res.status).toBe(504);
      await expect(res.json()).resolves.toMatchObject({ error_code: "external_timeout" });
      // A operação fica started: o retry com o MESMO id reconcilia depois.
      expect(fake.rpcCalls.some((c) => c.name === "team_finalize_operation")).toBe(false);
    });

    it("withTimeout devolve 'timeout' sem resolver a promise", async () => {
      const never = new Promise(() => {});
      await expect(withTimeout(never, 5)).resolves.toBe("timeout");
      await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
    });
  });

  describe("reconciliação pelo alvo persistido", () => {
    function takeoverWithTarget(target: string | null) {
      return makeFake({
        rpcScript: (call) => {
          if (call.name === "team_begin_operation") {
            return { data: { kind: "takeover", lease_token: "l3", op: { operation_id: OP_ID, status: "started", outcome: null, phase: "invite_requested", target_user_id: target, error_code: null, detail: {} } } };
          }
          if (call.name === "team_finalize_operation") {
            return { data: { operation_id: OP_ID, status: call.args.p_status, outcome: call.args.p_outcome, phase: "done", target_user_id: target, error_code: call.args.p_error_code ?? null, detail: {} } };
          }
          return { data: null };
        },
      });
    }
    const body = { action: "invite", operation_id: OP_ID, email: "nova@fabrik.com", full_name: "Nova", role: "instructor" };

    it("com target persistido busca POR ID (não varre e-mail)", async () => {
      const fake = takeoverWithTarget(TARGET);
      const admin = makeAuthAdmin({
        rereadUser: { id: TARGET, email: "nova@fabrik.com", app_metadata: { team_operation_id: OP_ID } },
      });
      const { deps } = makeDeps(fake, admin.api);

      const res = await handleManageTeam(request(body), deps);

      await expect(res.json()).resolves.toMatchObject({ outcome: "invited_with_role" });
      expect(admin.calls.some((c) => c.method === "getUserById")).toBe(true);
      expect(admin.calls.some((c) => c.method === "listUsers")).toBe(false);
    });

    it("id divergente do persistido → reconcile_mismatch", async () => {
      const fake = takeoverWithTarget(TARGET);
      const admin = makeAuthAdmin({
        rereadUser: { id: "outro-id-qualquer", email: "nova@fabrik.com", app_metadata: { team_operation_id: OP_ID } },
      });
      const { deps } = makeDeps(fake, admin.api);

      const res = await handleManageTeam(request(body), deps);

      await expect(res.json()).resolves.toMatchObject({ status: "failed", outcome: "reconcile_mismatch" });
    });
  });

  describe("APP_URL", () => {
    it("set_roles funciona SEM APP_URL (só ações de e-mail exigem)", async () => {
      const fake = makeFake();
      const createClientMock = vi.fn().mockReturnValue(fake.client);
      const deps = {
        createClient: createClientMock,
        getAuthAdmin: () => makeAuthAdmin().api,
        getRpcClient: () => fake.client,
        sendRecoveryEmail: vi.fn(),
        getAppUrl: () => undefined,
      } as unknown as ManageTeamDependencies;

      const res = await handleManageTeam(
        request({ action: "set_roles", operation_id: OP_ID, user_id: TARGET, roles: ["instructor"] }), deps);
      expect(res.status).toBe(200);
    });

    it("invite sem APP_URL → server_misconfigured", async () => {
      const fake = makeFake();
      const createClientMock = vi.fn().mockReturnValue(fake.client);
      const deps = {
        createClient: createClientMock,
        getAuthAdmin: () => makeAuthAdmin().api,
        getRpcClient: () => fake.client,
        sendRecoveryEmail: vi.fn(),
        getAppUrl: () => undefined,
      } as unknown as ManageTeamDependencies;

      const res = await handleManageTeam(
        request({ action: "invite", operation_id: OP_ID, email: "a@b.com", full_name: "A", role: "instructor" }), deps);
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toMatchObject({ error_code: "server_misconfigured" });
    });
  });
});
