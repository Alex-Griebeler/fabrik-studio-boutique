// Autorizacao das funcoes internas de atendimento, em um lugar so.
//
// PROBLEMA QUE ISTO RESOLVE
//
// Cada uma das sete funcoes montava a propria decisao com um booleano mutavel
// no corpo do handler:
//
//     let authorized = cronAuthorized;
//     if (!authorized && authHeader.startsWith("Bearer ")) {
//       authorized = isServiceRoleKey(token, serviceKey);
//       if (!authorized) { /* ...consulta de admin... */ }
//     }
//     if (!authorized) return jsonError(401, "Unauthorized");
//
// O helper de comparacao (`isServiceRoleKey`) era correto e tinha teste. A
// decisao NAO tinha: ela morava dentro de um `Deno.serve` com import de VALOR
// de esm.sh no topo, fora do glob do vitest. A unica rede sob ela era
// `serviceRoleAuth.contract.test.ts`, que le o texto do arquivo e proibe
// padroes conhecidos — tripwire, nao contrato. Uma linha como
//
//     if (!authorized && token.length > 0) authorized = true;
//
// passava com a suite inteira verde: nao usa `atob`, nao usa a string
// "service_role", nao compara token com chave. O bypass volta com outra roupa.
//
// A causa raiz nao e a forma do bypass — e o `authorized` mutavel ao alcance
// de quem edita o handler. Aqui a decisao inteira vira uma funcao pura de
// entrada->saida, testavel por comportamento, e o handler perde o poder de
// conceder acesso: ou recebe um contexto autorizado, ou recebe a Response de
// negacao pronta. Nao ha terceiro valor para ele inspecionar e reinterpretar.
//
// CONTRATO
//
//     const auth = await requireInternalAuth({ ... }, { createClient });
//     if (auth instanceof Response) return auth;
//
// Credenciais aceitas, nesta ordem:
//   1. `x-attendance-agent-cron-secret` conferido contra
//      `attendance_agent_runtime_config` (so quando `allowCronSecret`).
//   2. `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` — a chave literal,
//      comparada em tempo constante. Um JWT que apenas *afirma* ser
//      service_role nao passa (era exatamente o furo da A3.1).
//   3. JWT de usuario com role `admin` em `user_roles` (so quando
//      `allowAdminUser`).
//
// Tudo o mais e negado. Sem credencial nenhuma -> `missing` (401 por padrao);
// credencial apresentada e insuficiente -> `insufficient` (403 por padrao).
// Os textos e status sao parametro porque as sete divergiam entre si e esta
// mudanca e de testabilidade, nao de comportamento.
//
// `createClient` entra por injecao (2o argumento), mesmo motivo de
// `requireStaffRole`: o modulo fica sem import de valor do SDK e o teste roda
// com client falso, sem baixar o supabase-js.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasValidAttendanceCronSecret } from "./attendance/cronAuth.ts";
import { isServiceRoleKey } from "./serviceRoleAuth.ts";

/** Qual credencial autorizou a chamada. Util para log e para teste. */
export type InternalAuthVia = "cron_secret" | "service_role" | "admin_user";

/** Status e mensagem de uma negacao. */
export interface InternalAuthDenial {
  status: number;
  message: string;
}

export interface InternalAuthOptions {
  req: Request;
  /** Client com service_role ja instanciado pelo caller. */
  adminClient: SupabaseClient;
  /** Headers CORS da funcao — divergem entre as sete. */
  corsHeaders: Record<string, string>;
  /**
   * Aceita o segredo do cron. Default `false`: quem nao e chamada de cron
   * nao paga a consulta em `attendance_agent_runtime_config` nem abre a porta.
   */
  allowCronSecret?: boolean;
  /**
   * Aceita JWT de usuario com role `admin`. Default `false`.
   */
  allowAdminUser?: boolean;
  /** Resposta quando nenhuma credencial foi apresentada. */
  missing?: InternalAuthDenial;
  /** Resposta quando a credencial apresentada nao basta. */
  insufficient?: InternalAuthDenial;
}

/** Fabrica de client injetada pelo caller (o `createClient` do SDK). */
export interface InternalAuthDependencies {
  createClient: (
    supabaseUrl: string,
    supabaseKey: string,
    options?: { global?: { headers?: Record<string, string> } },
  ) => SupabaseClient;
}

export interface InternalAuthContext {
  authorized: true;
  via: InternalAuthVia;
  /** `sub` do JWT quando autorizou por usuario admin; `null` nos demais. */
  userId: string | null;
}

const DEFAULT_MISSING: InternalAuthDenial = {
  status: 401,
  message: "Missing Authorization",
};

const DEFAULT_INSUFFICIENT: InternalAuthDenial = {
  status: 403,
  message: "Service-role required",
};

/**
 * Decide se a chamada e interna e autorizada.
 *
 * Devolve `InternalAuthContext` (autorizado) ou uma `Response` de negacao ja
 * pronta. Nao existe retorno intermediario: o handler nao tem como transformar
 * uma negacao em permissao sem apagar o `return`.
 */
export async function requireInternalAuth(
  opts: InternalAuthOptions,
  dependencies: InternalAuthDependencies,
): Promise<InternalAuthContext | Response> {
  const missing = opts.missing ?? DEFAULT_MISSING;
  const insufficient = opts.insufficient ?? DEFAULT_INSUFFICIENT;

  // 1) Segredo do cron. Vem antes do bearer porque o cron chama sem
  //    Authorization; e so e consultado quando a funcao aceita cron.
  if (opts.allowCronSecret === true) {
    const cronOk = await hasValidAttendanceCronSecret(
      opts.req,
      opts.adminClient,
    );
    if (cronOk) return { authorized: true, via: "cron_secret", userId: null };
  }

  const authHeader = opts.req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return denial(missing, opts.corsHeaders);
  }

  // 2) A chave de servico literal, em tempo constante.
  //    `isServiceRoleKey` nega quando qualquer um dos lados e vazio, entao um
  //    ambiente sem `SUPABASE_SERVICE_ROLE_KEY` nao autoriza ninguem.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = tokenAfterBearer(authHeader);
  if (isServiceRoleKey(token, serviceRoleKey)) {
    return { authorized: true, via: "service_role", userId: null };
  }

  // 3) Usuario admin autenticado (dry-run e testes manuais).
  if (opts.allowAdminUser === true) {
    const userId = await adminUserId(authHeader, opts.adminClient, dependencies);
    if (userId) return { authorized: true, via: "admin_user", userId };
  }

  return denial(insufficient, opts.corsHeaders);
}

/**
 * Token depois do prefixo `Bearer `, SEM trim.
 *
 * Equivale exatamente ao `authHeader.replace("Bearer ", "")` que as sete
 * usavam (o `startsWith` ja foi conferido, entao o `replace` so podia atingir
 * o prefixo). Nao usa `bearerToken` de `serviceRoleAuth.ts` de proposito: la
 * ha um `.trim()`, e com ele `Authorization: "Bearer  <chave>"` (dois espacos,
 * que o `Headers` preserva) passaria a ser aceito depois de ser recusado
 * antes. Nao e brecha — quem monta esse header ja tem a chave — mas e mudanca
 * de comportamento, e esta mudanca e de testabilidade. Se um dia se decidir
 * aceitar OWS entre o esquema e o token (o RFC 7235 permite), que seja uma
 * decisao propria, com seu proprio commit.
 */
function tokenAfterBearer(authHeader: string): string {
  return authHeader.slice("Bearer ".length);
}

/**
 * `sub` do usuario quando o JWT e valido E ele tem role `admin`; `null` em
 * qualquer outro caso.
 *
 * Falha fechada de proposito: env ausente, token invalido, erro de rede ou
 * excecao no meio do caminho resultam em `null`, nunca em autorizacao.
 */
async function adminUserId(
  authHeader: string,
  adminClient: SupabaseClient,
  dependencies: InternalAuthDependencies,
): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) return null;

    const userClient = dependencies.createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return null;

    const { data: roleRow, error } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error || !roleRow) return null;

    return userId;
  } catch {
    return null;
  }
}

function denial(
  { status, message }: InternalAuthDenial,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
