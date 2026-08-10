// Handler do `manage-team` (PR T1 da spec Colaboradores v5).
//
// A Edge é ORQUESTRADORA: autentica (admin-only), valida o envelope, fala com
// a Auth Admin API e chama as RPCs transacionais do banco. Nenhuma decisão de
// privilégio mora aqui — as guardas (último admin, student intocável, lease/
// fencing, idempotência) são do banco e valem até contra esta função.
//
// Vive em `_shared/` no padrão bancário: sem import de VALOR do SDK
// (`createClient` chega por injeção), então o vitest cobre o handler inteiro.
//
// Contrato de erros: SQLSTATEs T0001..T0011 das RPCs mapeados por `error.code`
// (nunca por texto) para códigos HTTP/API estáveis — ver ERRCODE_MAP.

import {
  requireStaffRole,
  type AuthorizedContext,
  type RequireStaffRoleDependencies,
} from "../requireStaffRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Papéis conviáveis/atribuíveis pela tela. Student NUNCA (D1/D5 da spec). */
export const STAFF_ROLES = ["admin", "manager", "reception", "instructor"] as const;
export type StaffRoleName = (typeof STAFF_ROLES)[number];

/** perPage do listUsers; teto de páginas contra resposta anômala (F9). */
export const LIST_PER_PAGE = 200;
export const LIST_MAX_PAGES = 21; // 20 páginas úteis + sentinela

/** SQLSTATE (RPC) → HTTP + api code. Mapeado por code, jamais por texto. */
const ERRCODE_MAP: Record<string, { http: number; code: string }> = {
  T0001: { http: 409, code: "operation_id_conflict" },
  T0002: { http: 409, code: "stale_lease" },
  T0003: { http: 409, code: "last_admin" },
  T0004: { http: 403, code: "actor_not_admin" },
  T0005: { http: 409, code: "operation_already_in_progress" },
  T0006: { http: 400, code: "use_revoke_access" },
  T0007: { http: 400, code: "cannot_remove_own_admin" },
  T0008: { http: 400, code: "student_role_untouchable" },
  T0010: { http: 202, code: "operation_in_progress" },
  T0011: { http: 429, code: "cooldown_active" },
};

interface AuthUserLike {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  invited_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}

/**
 * Superfície da Auth Admin API usada pelo handler — injetada pelo wrapper a
 * partir de `client.auth.admin`, e falsificável nos testes.
 */
export interface TeamAuthAdminApi {
  listUsers(opts: { page: number; perPage: number }): Promise<{
    data: { users: AuthUserLike[] } | null;
    error: { message: string } | null;
  }>;
  inviteUserByEmail(email: string, opts: {
    data: Record<string, unknown>;
    redirectTo: string;
  }): Promise<{ data: { user: AuthUserLike | null } | null; error: { message: string } | null }>;
  updateUserById(id: string, attrs: { app_metadata: Record<string, unknown> }): Promise<{
    data: { user: AuthUserLike | null } | null; error: { message: string } | null;
  }>;
  getUserById(id: string): Promise<{
    data: { user: AuthUserLike | null } | null; error: { message: string } | null;
  }>;
}

export interface ManageTeamDependencies extends RequireStaffRoleDependencies {
  /** `client.auth.admin` do client service-role — injetado pelo wrapper. */
  getAuthAdmin: (auth: AuthorizedContext) => TeamAuthAdminApi;
  /**
   * `resetPasswordForEmail` de um client DEDICADO com anon key, sem persistência
   * de sessão (F5 da fria: /recover é endpoint público; service key não o toca).
   */
  sendRecoveryEmail: (email: string, redirectTo: string) => Promise<{ error: { message: string } | null }>;
  /** APP_URL server-side (allowlist de redirect do Auth). */
  getAppUrl: () => string | undefined;
}

// ── Envelope ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MUTATING_ACTIONS = ["invite", "set_roles", "revoke_access", "send_recovery"] as const;
const ALL_ACTIONS = ["list", ...MUTATING_ACTIONS] as const;

export async function handleManageTeam(
  req: Request,
  deps: ManageTeamDependencies,
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error_code: "method_not_allowed" }, 405);

  try {
    const auth = await requireStaffRole(
      { req, allowed: ["admin"], allowServiceRole: false },
      deps,
    );
    if (auth instanceof Response) return auth;
    // requireStaffRole com allowServiceRole:false garante userId presente.
    const actor = auth.userId!;

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error_code: "bad_json" }, 400);
    }

    const action = body.action;
    if (typeof action !== "string" || !(ALL_ACTIONS as ReadonlyArray<string>).includes(action)) {
      return json({ error_code: "unknown_action" }, 400);
    }

    const authAdmin = deps.getAuthAdmin(auth);

    if (action === "list") {
      return await handleList(auth, authAdmin);
    }

    // Mutações exigem operation_id (uuid gerado pelo cliente por TENTATIVA).
    const operationId = body.operation_id;
    if (typeof operationId !== "string" || !UUID_RE.test(operationId)) {
      return json({ error_code: "bad_operation_id" }, 400);
    }

    const appUrl = deps.getAppUrl();
    if (!appUrl) {
      console.error("manage-team: APP_URL ausente");
      return json({ error_code: "server_misconfigured" }, 500);
    }
    const redirectTo = `${appUrl.replace(/\/$/, "")}/reset-password`;

    switch (action) {
      case "invite":
        return await handleInvite(auth, authAdmin, actor, operationId, body, redirectTo);
      case "set_roles":
        return await handleSetRoles(auth, actor, operationId, body);
      case "revoke_access":
        return await handleRevokeAccess(auth, actor, operationId, body);
      case "send_recovery":
        return await handleSendRecovery(auth, authAdmin, deps, actor, operationId, body, redirectTo);
      default:
        return json({ error_code: "unknown_action" }, 400);
    }
  } catch (error) {
    console.error("manage-team fatal:", error instanceof Error ? error.message : error);
    return json({ error_code: "unexpected" }, 500);
  }
}

// ── list ────────────────────────────────────────────────────────────────────

async function handleList(auth: AuthorizedContext, authAdmin: TeamAuthAdminApi): Promise<Response> {
  // Paginação por COMPRIMENTO (F9): o SDK devolve total 0 quando o header
  // falta, então "total presente" não é testável. Erro em qualquer página
  // invalida a resposta INTEIRA — nunca lista parcial.
  const byId = new Map<string, AuthUserLike>();
  for (let page = 1; page <= LIST_MAX_PAGES; page++) {
    const { data, error } = await authAdmin.listUsers({ page, perPage: LIST_PER_PAGE });
    if (error || !data) {
      console.error("manage-team list: listUsers falhou", error?.message);
      return json({ error_code: "auth_list_failed" }, 502);
    }
    for (const u of data.users) byId.set(u.id, u);
    if (data.users.length < LIST_PER_PAGE) break;
    if (page === LIST_MAX_PAGES) {
      return json({ error_code: "too_many_users" }, 502);
    }
  }

  const users = [...byId.values()];
  const ids = users.map((u) => u.id);
  const supabase = auth.adminClient;

  // Joins SÓ por auth_user_id/user_id (e-mail de profiles nunca é identidade),
  // em lotes de 500.
  const profileByAuthId = new Map<string, string>();
  const rolesByUserId = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("auth_user_id, full_name")
      .in("auth_user_id", chunk);
    if (pErr) return json({ error_code: "profiles_lookup_failed" }, 502);
    for (const p of profiles ?? []) profileByAuthId.set(p.auth_user_id, p.full_name);

    const { data: roles, error: rErr } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", chunk);
    if (rErr) return json({ error_code: "roles_lookup_failed" }, 502);
    for (const r of roles ?? []) {
      const list = rolesByUserId.get(r.user_id) ?? [];
      list.push(r.role);
      rolesByUserId.set(r.user_id, list);
    }
  }

  const rows = users
    .map((u) => ({
      user_id: u.id,
      full_name: profileByAuthId.get(u.id) ?? "",
      email: u.email ?? "",
      roles: (rolesByUserId.get(u.id) ?? []).sort(),
      created_at: u.created_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
      invited_at: u.invited_at ?? null,
      // F12: pendente = convidado E nunca confirmado. Não-confirmado SEM
      // invited_at é outra coisa (revisão manual).
      invite_pending: !!u.invited_at && !u.email_confirmed_at,
    }))
    .sort((a, b) =>
      (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.user_id.localeCompare(b.user_id)
    );

  return json({ users: rows });
}

// ── Saga: helpers ───────────────────────────────────────────────────────────

interface RpcErrorLike { code?: string; message?: string }

function mapRpcError(error: RpcErrorLike, operationId: string): Response {
  const mapped = error.code ? ERRCODE_MAP[error.code] : undefined;
  if (mapped) return json({ operation_id: operationId, error_code: mapped.code }, mapped.http);
  console.error("manage-team rpc:", error.code, error.message);
  return json({ operation_id: operationId, error_code: "rpc_failed" }, 500);
}

/** Fingerprint canônico e determinístico (R3-10): chaves fixas, UTF-8, sha256. */
export async function canonicalFingerprint(parts: ReadonlyArray<string>): Promise<string> {
  const canonical = parts.join(" ");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizeFullName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (name.length < 1 || name.length > 120) return null;
  return name;
}

interface BeginResult {
  kind: "new" | "replay" | "takeover";
  lease_token?: string;
  op: {
    operation_id: string;
    status: string;
    outcome: string | null;
    phase: string;
    target_user_id: string | null;
    error_code: string | null;
    detail: Record<string, unknown>;
  };
}

async function beginOperation(
  auth: AuthorizedContext,
  args: {
    operationId: string;
    actor: string;
    action: string;
    targetEmail: string | null;
    targetUserId: string | null;
    fingerprint: string;
  },
): Promise<{ result?: BeginResult; errorResponse?: Response }> {
  const { data, error } = await auth.adminClient.rpc("team_begin_operation", {
    p_operation_id: args.operationId,
    p_actor: args.actor,
    p_action: args.action,
    p_target_email: args.targetEmail,
    p_target_user_id: args.targetUserId,
    p_fingerprint: args.fingerprint,
  });
  if (error) return { errorResponse: mapRpcError(error, args.operationId) };
  return { result: data as BeginResult };
}

function opResponse(op: BeginResult["op"], http = 200): Response {
  return json({
    operation_id: op.operation_id,
    status: op.status,
    outcome: op.outcome,
    error_code: op.error_code,
    user_id: op.target_user_id,
    ...(op.detail?.roles !== undefined ? { roles: op.detail.roles } : {}),
    ...(op.detail?.recoverable !== undefined ? { recoverable: op.detail.recoverable } : {}),
  }, http);
}

async function finalize(
  auth: AuthorizedContext,
  operationId: string,
  leaseToken: string,
  status: "succeeded" | "partial" | "failed",
  outcome: string,
  errorCode: string | null = null,
  detailPatch: Record<string, unknown> | null = null,
): Promise<Response> {
  const { data, error } = await auth.adminClient.rpc("team_finalize_operation", {
    p_operation_id: operationId,
    p_lease_token: leaseToken,
    p_status: status,
    p_outcome: outcome,
    p_error_code: errorCode,
    p_detail_patch: detailPatch,
  });
  if (error) return mapRpcError(error, operationId);
  return opResponse(data as BeginResult["op"]);
}

// ── invite ──────────────────────────────────────────────────────────────────

async function handleInvite(
  auth: AuthorizedContext,
  authAdmin: TeamAuthAdminApi,
  actor: string,
  operationId: string,
  body: Record<string, unknown>,
  redirectTo: string,
): Promise<Response> {
  const email = normalizeEmail(body.email);
  if (!email) return json({ error_code: "bad_email" }, 400);
  const fullName = normalizeFullName(body.full_name);
  if (!fullName) return json({ error_code: "bad_full_name" }, 400);
  const role = body.role;
  if (typeof role !== "string" || !(STAFF_ROLES as ReadonlyArray<string>).includes(role)) {
    return json({ error_code: "role_not_staff" }, 400);
  }

  const fingerprint = await canonicalFingerprint(["invite", email, fullName, role]);
  const begin = await beginOperation(auth, {
    operationId, actor, action: "invite", targetEmail: email, targetUserId: null, fingerprint,
  });
  if (begin.errorResponse) return begin.errorResponse;
  const { kind, lease_token: lease, op } = begin.result!;

  if (kind === "replay") return opResponse(op);

  if (kind === "takeover") {
    return await reconcileInvite(auth, authAdmin, actor, operationId, lease!, op, email, role);
  }

  // ── caminho novo ──
  // Pre-check: e-mail já existe no Auth? (Admin API não tem busca por e-mail;
  // varredura paginada — base mono-estúdio é minúscula e o teto de F9 vale.)
  const existing = await findUserByEmail(authAdmin, email);
  if (existing === undefined) {
    return await finalize(auth, operationId, lease!, "failed", "auth_lookup_failed", "auth_list_failed");
  }
  if (existing !== null) {
    return await finalize(auth, operationId, lease!, "succeeded", classifyExisting(existing), null, {
      existing_user_id: existing.id,
    });
  }

  // Passo 2: phase → invite_requested ANTES da chamada externa.
  {
    const { error } = await auth.adminClient.rpc("team_advance_phase", {
      p_operation_id: operationId, p_lease_token: lease,
      p_new_phase: "invite_requested", p_target_user_id: null, p_detail_patch: null,
    });
    if (error) return mapRpcError(error, operationId);
  }

  // Passo 3: convite. `data` leva SÓ full_name (user_metadata é forjável e
  // NUNCA é prova — a proveniência vai em app_metadata nos passos 5-6).
  const invited = await authAdmin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo,
  });
  if (invited.error || !invited.data?.user) {
    return await finalize(auth, operationId, lease!, "failed", "invite_failed", "invite_failed");
  }
  const userId = invited.data.user.id;

  // Passo 4: persistir target (phase inalterada).
  {
    const { error } = await auth.adminClient.rpc("team_advance_phase", {
      p_operation_id: operationId, p_lease_token: lease,
      p_new_phase: "invite_requested", p_target_user_id: userId, p_detail_patch: null,
    });
    if (error) return mapRpcError(error, operationId);
  }

  // Passos 5-6: marca de proveniência em app_metadata + releitura de verificação.
  const marked = await markProvenance(authAdmin, userId, operationId, invited.data.user);
  if (!marked) {
    return await finalize(auth, operationId, lease!, "partial", "invited_without_role",
      "provenance_mark_failed", { recoverable: true });
  }

  // Passo 7: phase → auth_user_observed e papel.
  {
    const { error } = await auth.adminClient.rpc("team_advance_phase", {
      p_operation_id: operationId, p_lease_token: lease,
      p_new_phase: "auth_user_observed", p_target_user_id: null, p_detail_patch: null,
    });
    if (error) return mapRpcError(error, operationId);
  }
  {
    const { error } = await auth.adminClient.rpc("team_assign_role_after_invite", {
      p_operation_id: operationId, p_lease_token: lease,
      p_actor: actor, p_target: userId, p_role: role,
    });
    if (error) {
      // Papel falhou (ex.: ator rebaixado no meio) — parcial estruturado e
      // recuperável pela tela; a finalização NÃO exige ator admin (R3-5).
      return await finalize(auth, operationId, lease!, "partial", "invited_without_role",
        (error as RpcErrorLike).code === "T0004" ? "actor_not_admin" : "role_assign_failed",
        { recoverable: true });
    }
  }

  return await finalize(auth, operationId, lease!, "succeeded", "invited_with_role");
}

/** undefined = falha de consulta; null = não existe; user = existe. */
async function findUserByEmail(
  authAdmin: TeamAuthAdminApi,
  email: string,
): Promise<AuthUserLike | null | undefined> {
  for (let page = 1; page <= LIST_MAX_PAGES; page++) {
    const { data, error } = await authAdmin.listUsers({ page, perPage: LIST_PER_PAGE });
    if (error || !data) return undefined;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < LIST_PER_PAGE) return null;
  }
  return undefined;
}

function classifyExisting(user: AuthUserLike): string {
  if (user.email_confirmed_at) return "already_active_user";
  if (user.invited_at) return "already_pending_invite";
  return "already_unconfirmed_user";
}

/** Passos 5-6 da proveniência: grava app_metadata e VERIFICA relendo. */
async function markProvenance(
  authAdmin: TeamAuthAdminApi,
  userId: string,
  operationId: string,
  currentUser: AuthUserLike,
): Promise<boolean> {
  const updated = await authAdmin.updateUserById(userId, {
    app_metadata: { ...(currentUser.app_metadata ?? {}), team_operation_id: operationId },
  });
  if (updated.error) return false;
  const reread = await authAdmin.getUserById(userId);
  if (reread.error || !reread.data?.user) return false;
  return reread.data.user.app_metadata?.team_operation_id === operationId;
}

/**
 * Reconciliação de lease vencido (R3-1/R3-2): a EDGE consulta o Auth; papel só
 * é atribuído se o usuário encontrado carrega a marca DESTA operação. NUNCA
 * reenvia e-mail (D8).
 */
async function reconcileInvite(
  auth: AuthorizedContext,
  authAdmin: TeamAuthAdminApi,
  actor: string,
  operationId: string,
  lease: string,
  op: BeginResult["op"],
  email: string,
  role: string,
): Promise<Response> {
  if (op.phase === "preflight") {
    // Nenhuma chamada externa aconteceu — encerrar como falha reexecutável
    // com operation_id NOVO (não reexecutamos convite dentro de takeover de
    // preflight para manter o caminho único de envio).
    return await finalize(auth, operationId, lease, "failed", "invite_not_started", null);
  }

  const found = await findUserByEmail(authAdmin, email);
  if (found === undefined) {
    return await finalize(auth, operationId, lease, "failed", "auth_lookup_failed", "auth_list_failed");
  }

  if (found === null) {
    // Convite nunca materializou usuário: falha; reenvio SÓ por nova operação.
    return await finalize(auth, operationId, lease, "failed", "invite_failed", null);
  }

  if (found.app_metadata?.team_operation_id !== operationId) {
    // Usuário existe mas NÃO nasceu desta operação — jamais ganha papel aqui.
    return await finalize(auth, operationId, lease, "succeeded", classifyExisting(found), null, {
      existing_user_id: found.id,
    });
  }

  // Nasceu desta operação: completar o que faltar.
  if (op.phase === "invite_requested") {
    const { error } = await auth.adminClient.rpc("team_advance_phase", {
      p_operation_id: operationId, p_lease_token: lease,
      p_new_phase: "auth_user_observed", p_target_user_id: found.id, p_detail_patch: null,
    });
    if (error) return mapRpcError(error, operationId);
  }
  {
    const { error } = await auth.adminClient.rpc("team_assign_role_after_invite", {
      p_operation_id: operationId, p_lease_token: lease,
      p_actor: actor, p_target: found.id, p_role: role,
    });
    if (error) {
      return await finalize(auth, operationId, lease, "partial", "invited_without_role",
        (error as RpcErrorLike).code ?? "role_assign_failed", { recoverable: true });
    }
  }
  return await finalize(auth, operationId, lease, "succeeded", "invited_with_role");
}

// ── set_roles / revoke_access ───────────────────────────────────────────────

async function handleSetRoles(
  auth: AuthorizedContext,
  actor: string,
  operationId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const target = body.user_id;
  if (typeof target !== "string" || !UUID_RE.test(target)) {
    return json({ error_code: "bad_user_id" }, 400);
  }
  const rawRoles = body.roles;
  if (!Array.isArray(rawRoles)) return json({ error_code: "bad_roles" }, 400);
  const roles = [...new Set(rawRoles)].sort();
  if (roles.length === 0) return json({ error_code: "use_revoke_access" }, 400);
  for (const r of roles) {
    if (typeof r !== "string" || !(STAFF_ROLES as ReadonlyArray<string>).includes(r)) {
      return json({ error_code: "student_role_untouchable" }, 400);
    }
  }

  const fingerprint = await canonicalFingerprint(["set_roles", target, ...(roles as string[])]);
  const begin = await beginOperation(auth, {
    operationId, actor, action: "set_roles", targetEmail: null, targetUserId: target, fingerprint,
  });
  if (begin.errorResponse) return begin.errorResponse;
  const { kind, lease_token: lease, op } = begin.result!;
  if (kind === "replay") return opResponse(op);
  if (kind === "takeover" && op.phase === "role_assigned") {
    return await finalize(auth, operationId, lease!, "succeeded", "roles_set");
  }

  const { data, error } = await auth.adminClient.rpc("team_set_roles", {
    p_operation_id: operationId, p_lease_token: lease,
    p_actor: actor, p_target: target, p_roles: roles,
  });
  if (error) {
    const mapped = mapRpcError(error, operationId);
    // Erros de NEGÓCIO (não de lease) finalizam a operação como failed para o
    // registro de domínio não ficar pendurado.
    const code = (error as RpcErrorLike).code;
    if (code && code !== "T0002" && code !== "T0010") {
      await finalize(auth, operationId, lease!, "failed", "rejected", ERRCODE_MAP[code]?.code ?? code);
    }
    return mapped;
  }
  const state = data as { user_id: string; roles: string[] };
  return await finalize(auth, operationId, lease!, "succeeded", "roles_set", null, {
    roles: state.roles,
  });
}

async function handleRevokeAccess(
  auth: AuthorizedContext,
  actor: string,
  operationId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const target = body.user_id;
  if (typeof target !== "string" || !UUID_RE.test(target)) {
    return json({ error_code: "bad_user_id" }, 400);
  }

  const fingerprint = await canonicalFingerprint(["revoke_access", target]);
  const begin = await beginOperation(auth, {
    operationId, actor, action: "revoke_access", targetEmail: null, targetUserId: target, fingerprint,
  });
  if (begin.errorResponse) return begin.errorResponse;
  const { kind, lease_token: lease, op } = begin.result!;
  if (kind === "replay") return opResponse(op);
  if (kind === "takeover" && op.phase === "role_assigned") {
    return await finalize(auth, operationId, lease!, "succeeded", "access_revoked");
  }

  const { data, error } = await auth.adminClient.rpc("team_revoke_access", {
    p_operation_id: operationId, p_lease_token: lease,
    p_actor: actor, p_target: target,
  });
  if (error) {
    const mapped = mapRpcError(error, operationId);
    const code = (error as RpcErrorLike).code;
    if (code && code !== "T0002" && code !== "T0010") {
      await finalize(auth, operationId, lease!, "failed", "rejected", ERRCODE_MAP[code]?.code ?? code);
    }
    return mapped;
  }
  const state = data as { user_id: string; roles: string[] };
  return await finalize(auth, operationId, lease!, "succeeded", "access_revoked", null, {
    roles: state.roles,
  });
}

// ── send_recovery ───────────────────────────────────────────────────────────

async function handleSendRecovery(
  auth: AuthorizedContext,
  authAdmin: TeamAuthAdminApi,
  deps: ManageTeamDependencies,
  actor: string,
  operationId: string,
  body: Record<string, unknown>,
  redirectTo: string,
): Promise<Response> {
  const target = body.user_id;
  if (typeof target !== "string" || !UUID_RE.test(target)) {
    return json({ error_code: "bad_user_id" }, 400);
  }

  const fingerprint = await canonicalFingerprint(["send_recovery", target]);
  const begin = await beginOperation(auth, {
    operationId, actor, action: "send_recovery", targetEmail: null, targetUserId: target, fingerprint,
  });
  if (begin.errorResponse) return begin.errorResponse;
  const { kind, lease_token: lease, op } = begin.result!;
  if (kind === "replay") return opResponse(op);
  if (kind === "takeover") {
    // E-mail é "envio solicitado" (D8): pós-takeover NUNCA reenviamos —
    // encerramos com o que dá pra afirmar.
    const outcome = op.phase === "recovery_requested" ? "recovery_requested" : "recovery_not_started";
    return await finalize(auth, operationId, lease!,
      op.phase === "recovery_requested" ? "succeeded" : "failed", outcome);
  }

  const { data: found, error: lookupErr } = await authAdmin.getUserById(target);
  if (lookupErr || !found?.user) {
    return await finalize(auth, operationId, lease!, "failed", "user_not_found", null);
  }
  if (!found.user.email_confirmed_at) {
    return await finalize(auth, operationId, lease!, "failed", "user_not_confirmed", null);
  }
  const email = (found.user.email ?? "").toLowerCase();
  if (!email) {
    return await finalize(auth, operationId, lease!, "failed", "user_without_email", null);
  }

  {
    const { error } = await auth.adminClient.rpc("team_advance_phase", {
      p_operation_id: operationId, p_lease_token: lease,
      p_new_phase: "recovery_requested", p_target_user_id: null, p_detail_patch: null,
    });
    if (error) return mapRpcError(error, operationId);
  }

  const sent = await deps.sendRecoveryEmail(email, redirectTo);
  if (sent.error) {
    return await finalize(auth, operationId, lease!, "failed", "recovery_send_failed", null);
  }
  return await finalize(auth, operationId, lease!, "succeeded", "recovery_requested");
}

// ── util ────────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
