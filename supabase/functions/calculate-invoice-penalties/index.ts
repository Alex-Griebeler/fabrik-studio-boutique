import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Calcula multa e juros para cobranças DCC vencidas.
 * Executada diariamente via Cron.
 *
 * Regras padrão (configuráveis via tabela policies):
 * - Multa: 2% do valor (aplicada uma vez, quando vence)
 * - Juros: 0,033% ao dia (max 1% ao mês)
 * - Status muda para "overdue" automaticamente
 *
 * IMPORTANTE: Apenas cobranças do tipo DCC recebem penalidades.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    const isServiceCall = authHeader?.includes(serviceKey);

    if (!isServiceCall && authHeader) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey;
      const { error: authErr } = await createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      }).auth.getUser();
      if (authErr) return json({ error: "Não autorizado" }, 401);
    }

    const { data: policies } = await supabase
      .from("policies")
      .select("key, value")
      .in("key", ["fine_rate_pct", "daily_interest_rate_pct", "max_monthly_interest_pct"]);

    const policyMap = new Map((policies ?? []).map(p => [p.key, p.value]));

    const fineRatePct = parseFloat(String(policyMap.get("fine_rate_pct") ?? "2"));
    const dailyInterestPct = parseFloat(String(policyMap.get("daily_interest_rate_pct") ?? "0.033"));
    const maxMonthlyInterestPct = parseFloat(String(policyMap.get("max_monthly_interest_pct") ?? "1"));

    const today = new Date().toISOString().substring(0, 10);

    // Only apply penalties to DCC charges
    const { data: overdueInvoices, error: fetchErr } = await supabase
      .from("invoices")
      .select("id, amount_cents, due_date, fine_amount_cents, interest_amount_cents, status, payment_type")
      .in("status", ["pending", "overdue"])
      .eq("payment_type", "dcc")
      .lt("due_date", today);

    if (fetchErr) return json({ error: "Erro ao buscar cobranças", details: fetchErr.message }, 500);
    if (!overdueInvoices || overdueInvoices.length === 0) {
      return json({ success: true, message: "Nenhuma cobrança DCC vencida", updated: 0 });
    }

    let updated = 0;
    let statusChanged = 0;

    for (const inv of overdueInvoices) {
      const dueDate = new Date(inv.due_date + "T00:00:00");
      const todayDate = new Date(today + "T00:00:00");
      const daysOverdue = Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysOverdue <= 0) continue;

      const fineAmountCents = Math.round(inv.amount_cents * (fineRatePct / 100));
      const dailyInterestCents = Math.round(inv.amount_cents * (dailyInterestPct / 100));
      const maxInterestCents = Math.round(inv.amount_cents * (maxMonthlyInterestPct / 100));
      const totalInterestCents = Math.min(dailyInterestCents * daysOverdue, maxInterestCents);

      const updateData: Record<string, unknown> = {
        fine_amount_cents: fineAmountCents,
        interest_amount_cents: totalInterestCents,
      };

      if (inv.status === "pending") {
        updateData.status = "overdue";
        statusChanged++;
      }

      const { error: upErr } = await supabase
        .from("invoices")
        .update(updateData)
        .eq("id", inv.id);

      if (!upErr) updated++;
      else console.error(`Error updating invoice ${inv.id}:`, upErr.message);
    }

    console.log(`Penalties: ${updated} DCC charges updated, ${statusChanged} moved to overdue`);

    return json({
      success: true,
      total_overdue: overdueInvoices.length,
      updated,
      status_changed: statusChanged,
      config: { fineRatePct, dailyInterestPct, maxMonthlyInterestPct },
    });
  } catch (error) {
    console.error("Error:", error);
    return json({ error: "Erro inesperado", details: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
