import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Cron diário financeiro — executa:
 * 1. Marca cobranças pendentes como "overdue" se vencidas
 * 2. Gera despesas recorrentes cujo próximo vencimento já chegou
 * 3. Ativa cobranças DCC "scheduled" cuja data agendada chegou
 *
 * Disparado via pg_cron diariamente às 06:00 UTC.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const today = new Date().toISOString().substring(0, 10);
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
});

function getNextRecurrenceDate(fromDate: Date, frequency: string): Date {
  const next = new Date(fromDate);
  switch (frequency) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  return next;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
