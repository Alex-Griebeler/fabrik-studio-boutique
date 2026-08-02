// Autorizacao fail-closed das edge functions financeiras.
//
// Antes deste helper as tres funcoes (`daily-finance-cron`,
// `generate-monthly-invoices`, `calculate-invoice-penalties`) eram
// `verify_jwt = false` e so validavam credencial QUANDO o header
// Authorization existia. Chamada sem header nenhum passava direto e
// executava escrita financeira — qualquer um na internet marcava faturas
// como `overdue`, ativava DCC e gerava despesas.
//
// Agora: sem credencial valida => 401. Sao aceitos exatamente
//   1. `x-finance-cron-secret` conferido contra `public.finance_runtime_config`
//      (o pg_cron monta esse header via COALESCE, nunca guarda o literal);
//   2. Bearer com a `SUPABASE_SERVICE_ROLE_KEY` (chamada interna);
//   3. opcionalmente, staff autenticado com uma das roles em `allowStaffRoles`
//      — usado so por `generate-monthly-invoices`, que o frontend chama com
//      JWT de usuario ao criar contrato.
//
// O segredo nunca e logado, nem o recebido nem o armazenado.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireStaffRole,
  type RequireStaffRoleDependencies,
  type StaffRole,
} from "../requireStaffRole.ts";
import { isFinanceCronSecret, timingSafeEqual } from "./logic.ts";

export const FINANCE_CRON_SECRET_HEADER = "x-finance-cron-secret";

export type FinanceAuthMode = "cron" | "service" | "staff";

export interface FinanceAuthOptions {
  req: Request;
  /**
   * Roles de staff aceitas alem de cron/service_role. Vazio ou ausente =
   * funcao service-to-service pura (nenhum JWT de usuario e aceito).
   */
  allowStaffRoles?: ReadonlyArray<StaffRole>;
}

export interface FinanceAuthContext {
  authorized: true;
  mode: FinanceAuthMode;
  /** sub do JWT; null em cron e service_role. */
  userId: string | null;
  /** Client service_role ja instanciado, para reuso pelo caller. */
  adminClient: SupabaseClient;
}

export type FinanceDependencies = RequireStaffRoleDependencies;

export async function requireFinanceAuth(
  opts: FinanceAuthOptions,
  dependencies: FinanceDependencies,
): Promise<FinanceAuthContext | Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("requireFinanceAuth: missing Supabase env vars");
    return serverError();
  }

  const adminClient = dependencies.createClient(supabaseUrl, serviceRoleKey);

  // 1) Segredo de cron. Header presente => decide aqui, sem fallback:
  //    segredo errado nunca "cai" para outro modo de autenticacao.
  const providedSecret = opts.req.headers.get(FINANCE_CRON_SECRET_HEADER)
    ?.trim();
  if (providedSecret) {
    if (!isFinanceCronSecret(providedSecret)) return unauthorized();

    const { data, error } = await adminClient
      .from("finance_runtime_config")
      .select("value")
      .eq("key", "cron_secret")
      .maybeSingle();

    if (error || !data?.value) {
      console.warn(
        "finance cron auth unavailable:",
        error?.message ?? "missing cron_secret",
      );
      return unauthorized();
    }

    if (!timingSafeEqual(providedSecret, data.value)) return unauthorized();

    return { authorized: true, mode: "cron", userId: null, adminClient };
  }

  // 2) Bearer service_role (cron legado, outra edge function, curl admin).
  const authHeader = opts.req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return unauthorized();
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (timingSafeEqual(token, serviceRoleKey)) {
    return { authorized: true, mode: "service", userId: null, adminClient };
  }

  // 3) Staff autenticado, so quando a funcao declara roles aceitas.
  const allowStaffRoles = opts.allowStaffRoles ?? [];
  if (allowStaffRoles.length === 0) {
    return unauthorized();
  }

  const staff = await requireStaffRole(
    // `allowServiceRole: false` porque o bypass de service_role ja foi
    // resolvido acima; aqui so resta validar JWT de usuario.
    { req: opts.req, allowed: allowStaffRoles, allowServiceRole: false },
    dependencies,
  );
  if (staff instanceof Response) return staff;

  return {
    authorized: true,
    mode: "staff",
    userId: staff.userId,
    adminClient: staff.adminClient,
  };
}

function unauthorized(): Response {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

function serverError(): Response {
  return jsonResponse({ error: "Internal error" }, 500);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}
