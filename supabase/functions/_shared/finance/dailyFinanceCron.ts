// Handler do `daily-finance-cron`.
//
// O corpo de execucao real e o mesmo de antes (marcar vencidas, ativar DCC
// agendada, gerar despesa recorrente) — nenhuma regra, data, arredondamento
// ou ordem foi alterada. O que muda: (1) exige credencial antes de qualquer
// query e (2) aceita `{"validateOnly": true}`, que resolve o conjunto de
// trabalho so com SELECT e retorna contagem/preview.
//
// Vive em `_shared/` porque e onde o vitest coleta teste e onde o modulo
// fica sem import de VALOR de esm.sh (o `createClient` chega por injecao).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireFinanceAuth, type FinanceDependencies } from "./cronAuth.ts";
import { getNextRecurrenceDate, parseFinanceRequest } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Quantos ids acompanham o preview do validateOnly. Nao afeta a contagem. */
const PREVIEW_LIMIT = 5;

export async function handleDailyFinanceCron(
  req: Request,
  deps: FinanceDependencies,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireFinanceAuth({ req }, deps);
  if (auth instanceof Response) return auth;

  const supabase = auth.adminClient;

  try {
    const body = await req.json().catch(() => ({}));
    const { validateOnly } = parseFinanceRequest(body);

    const today = new Date().toISOString().substring(0, 10);

    if (validateOnly) {
      return await previewDailyFinanceCron(supabase, today);
    }

    const results: Record<string, unknown> = {};

    // ─── 1. Mark overdue invoices ───────────────────────────────────────
    const { data: overdueResult, error: overdueErr } = await supabase
      .from("invoices")
      .update({ status: "overdue", updated_at: new Date().toISOString() })
      .eq("status", "pending")
      .lt("due_date", today)
      .select("id");

    results.overdue_marked = overdueResult?.length ?? 0;
    if (overdueErr) {
      console.error("Overdue error:", overdueErr.message);
      results.overdue_error = overdueErr.message;
    }

    // ─── 2. Activate scheduled DCC invoices ─────────────────────────────
    const { data: activatedResult, error: activateErr } = await supabase
      .from("invoices")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("status", "scheduled")
      .lte("scheduled_date", today)
      .select("id");

    results.dcc_activated = activatedResult?.length ?? 0;
    if (activateErr) {
      console.error("DCC activation error:", activateErr.message);
      results.dcc_error = activateErr.message;
    }

    // ─── 3. Generate recurring expenses ─────────────────────────────────
    const { data: recurringExpenses, error: recurErr } = await supabase
      .from("expenses")
      .select("*")
      .eq("is_recurring", true)
      .in("status", ["paid", "pending"])
      .neq("recurring_frequency", "none")
      .not("recurring_frequency", "is", null);

    let recurringGenerated = 0;

    if (recurringExpenses && !recurErr) {
      for (const exp of recurringExpenses) {
        // Check if recurring_until has passed
        if (exp.recurring_until && exp.recurring_until < today) continue;

        // Calculate next due date based on frequency
        const lastDueDate = new Date(exp.due_date + "T00:00:00");
        const nextDue = getNextRecurrenceDate(lastDueDate, exp.recurring_frequency ?? "monthly");

        // Only generate if next due date is today or in the past (but not too far)
        const nextDueStr = nextDue.toISOString().substring(0, 10);
        if (nextDueStr > today) continue;

        // Check if already generated (avoid duplicates via parent_expense_id + due_date)
        const { data: existing } = await supabase
          .from("expenses")
          .select("id")
          .eq("parent_expense_id", exp.id)
          .eq("due_date", nextDueStr)
          .limit(1);

        if (existing && existing.length > 0) continue;

        // Generate the new expense
        const { error: insertErr } = await supabase.from("expenses").insert({
          category_id: exp.category_id,
          supplier_id: exp.supplier_id,
          description: exp.description,
          amount_cents: exp.amount_cents,
          due_date: nextDueStr,
          status: "pending",
          payment_method: exp.payment_method,
          recurrence: exp.recurrence,
          recurring_frequency: exp.recurring_frequency,
          recurring_until: exp.recurring_until,
          is_recurring: true,
          parent_expense_id: exp.id,
          competence_date: nextDueStr,
          notes: `Gerado automaticamente a partir da despesa recorrente`,
        });

        if (!insertErr) {
          recurringGenerated++;
          // Update the parent's due_date to next cycle so it won't re-trigger
          await supabase
            .from("expenses")
            .update({ due_date: nextDueStr })
            .eq("id", exp.id);
        } else {
          console.error(`Error generating recurring expense from ${exp.id}:`, insertErr.message);
        }
      }
    }
    results.recurring_generated = recurringGenerated;
    if (recurErr) {
      console.error("Recurring fetch error:", recurErr.message);
      results.recurring_error = recurErr.message;
    }

    console.log("Daily finance cron results:", JSON.stringify(results));

    return json({ success: true, ...results });
  } catch (error) {
    console.error("Cron error:", error);
    return json(
      { error: "Erro inesperado", details: error instanceof Error ? error.message : "Unknown" },
      500
    );
  }
}

/**
 * Espelho somente-leitura das 3 etapas. Usa exatamente os mesmos filtros da
 * execucao real para que a contagem descreva o que seria escrito.
 *
 * Fail-safe: qualquer erro de leitura encerra aqui com 500 — e como nenhum
 * caminho deste ramo escreve, "encerrar" ja significa zero writes.
 */
async function previewDailyFinanceCron(
  supabase: SupabaseClient,
  today: string,
): Promise<Response> {
  const overdue = await supabase
    .from("invoices")
    .select("id", { count: "exact" })
    .eq("status", "pending")
    .lt("due_date", today)
    .limit(PREVIEW_LIMIT);

  if (overdue.error) return validateFailure("overdue", overdue.error.message);

  const scheduled = await supabase
    .from("invoices")
    .select("id", { count: "exact" })
    .eq("status", "scheduled")
    .lte("scheduled_date", today)
    .limit(PREVIEW_LIMIT);

  if (scheduled.error) return validateFailure("dcc", scheduled.error.message);

  const { data: recurringExpenses, error: recurErr } = await supabase
    .from("expenses")
    .select("*")
    .eq("is_recurring", true)
    .in("status", ["paid", "pending"])
    .neq("recurring_frequency", "none")
    .not("recurring_frequency", "is", null);

  if (recurErr) return validateFailure("recurring", recurErr.message);

  const recurringParentIds: string[] = [];

  for (const exp of recurringExpenses ?? []) {
    if (exp.recurring_until && exp.recurring_until < today) continue;

    const lastDueDate = new Date(exp.due_date + "T00:00:00");
    const nextDue = getNextRecurrenceDate(lastDueDate, exp.recurring_frequency ?? "monthly");
    const nextDueStr = nextDue.toISOString().substring(0, 10);
    if (nextDueStr > today) continue;

    const { data: existing, error: existingErr } = await supabase
      .from("expenses")
      .select("id")
      .eq("parent_expense_id", exp.id)
      .eq("due_date", nextDueStr)
      .limit(1);

    // Ambiguidade (nao da para afirmar se ja existe) encerra sem contagem.
    if (existingErr) return validateFailure("recurring_dedupe", existingErr.message);
    if (existing && existing.length > 0) continue;

    recurringParentIds.push(exp.id);
  }

  return json({
    success: true,
    validate_only: true,
    overdue_candidates: overdue.count ?? overdue.data?.length ?? 0,
    dcc_activation_candidates: scheduled.count ?? scheduled.data?.length ?? 0,
    recurring_candidates: recurringParentIds.length,
    preview: {
      overdue_invoice_ids: (overdue.data ?? []).map((row: { id: string }) => row.id),
      dcc_invoice_ids: (scheduled.data ?? []).map((row: { id: string }) => row.id),
      recurring_parent_expense_ids: recurringParentIds.slice(0, PREVIEW_LIMIT),
    },
  });
}

function validateFailure(stage: string, details: string): Response {
  console.error(`validateOnly aborted at ${stage}:`, details);
  return json({ error: "Falha ao validar", stage, validate_only: true }, 500);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
