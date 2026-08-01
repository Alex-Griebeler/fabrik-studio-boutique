// Helper de autorização pra edge functions sensíveis.
//
// Padroniza o fluxo "exige usuário staff autenticado, com role
// específica" usado em `send-whatsapp` e `emit-nfse`. Antes cada uma
// validava só presença de JWT, sem checar role — qualquer usuário
// autenticado (inclusive aluno) conseguia disparar mensagem ou emitir
// NFSe.
//
// Modos de auth aceitos:
//   1. Bearer com a `SUPABASE_SERVICE_ROLE_KEY` (chamada interna —
//      cron, outra edge function, curl admin). Pula a checagem de
//      role. Opcional via `allowServiceRole` (default true).
//   2. Bearer JWT de usuário autenticado. Helper valida o token via
//      `auth.getClaims`, extrai o `sub`, e confirma que esse user
//      tem PELO MENOS UMA das roles em `allowed` na tabela
//      `public.user_roles`. Usa client com SERVICE_ROLE só pra essa
//      consulta (bypassa RLS de user_roles, que é admin-only).
//
// Em falha, retorna Response 401 (sem Bearer / JWT inválido) ou 403
// (autenticado mas sem role). Body genérico, sem expor detalhes.
//
// `createClient` entra por injeção (2º argumento) em vez de import
// direto: o helper fica sem import de valor do SDK, então o teste
// unitário roda com client fake sem baixar/carregar o supabase-js.
// O tipo continua vindo do SDK via `import type` (apagado no bundle).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export type StaffRole = "admin" | "manager" | "reception" | "instructor";

export interface RequireStaffRoleOptions {
  req: Request;
  /** Roles aceitas. Usuário precisa ter pelo menos uma delas. */
  allowed: ReadonlyArray<StaffRole>;
  /**
   * Se true, bearer com SERVICE_ROLE_KEY pula a checagem de role
   * (chamada interna). Default true. Setar false em funções que NÃO
   * devem aceitar chamada interna (ex: emit-nfse hoje).
   */
  allowServiceRole?: boolean;
}

export interface AuthorizedContext {
  authorized: true;
  /** true quando a chamada veio com bearer service_role. */
  service: boolean;
  /** sub do JWT (null em chamadas service_role). */
  userId: string | null;
  /** Cliente com service_role já instanciado, pra reuso pelo caller. */
  adminClient: SupabaseClient;
}

/** Fábrica de client injetada pelo caller (o `createClient` do SDK). */
export interface RequireStaffRoleDependencies {
  createClient: (
    supabaseUrl: string,
    supabaseKey: string,
    options?: { global?: { headers?: Record<string, string> } },
  ) => SupabaseClient;
}

/**
 * Valida auth + role. Use:
 *   const auth = await requireStaffRole(
 *     { req, allowed: ["admin"] },
 *     { createClient },
 *   );
 *   if (auth instanceof Response) return auth;
 *   // segue com auth.adminClient / auth.userId
 */
export async function requireStaffRole(
  opts: RequireStaffRoleOptions,
  dependencies: RequireStaffRoleDependencies,
): Promise<AuthorizedContext | Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    // Misconfiguração de env do projeto — não vaza pra cliente o
    // detalhe, só loga.
    console.error("requireStaffRole: missing Supabase env vars");
    return serverError();
  }

  const allowServiceRole = opts.allowServiceRole !== false;

  const authHeader = opts.req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return unauthorized();
  }
  const token = authHeader.replace("Bearer ", "");

  const adminClient = dependencies.createClient(supabaseUrl, serviceRoleKey);

  // 1) Service role bypass (opcional).
  if (allowServiceRole && token === serviceRoleKey) {
    return {
      authorized: true,
      service: true,
      userId: null,
      adminClient,
    };
  }

  // 2) Valida JWT de usuário.
  const userClient = dependencies.createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsError } =
    await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return unauthorized();
  }
  const userId = (claimsData.claims as { sub?: string }).sub;
  if (!userId) return unauthorized();

  // 3) Confere role via SERVICE_ROLE (bypassa RLS de user_roles).
  //    user_roles está protegida com SELECT só pra admin/dono — sem
  //    bypass, o getClaims do usuário comum não enxergaria a própria
  //    role consistentemente.
  const { data: roleRow, error: roleErr } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", opts.allowed as unknown as string[])
    .limit(1)
    .maybeSingle();

  if (roleErr) {
    console.error("requireStaffRole: role lookup error", roleErr.message);
    return serverError();
  }
  if (!roleRow) {
    return forbidden();
  }

  return {
    authorized: true,
    service: false,
    userId,
    adminClient,
  };
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function forbidden(): Response {
  return new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serverError(): Response {
  return new Response(JSON.stringify({ error: "Internal error" }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
