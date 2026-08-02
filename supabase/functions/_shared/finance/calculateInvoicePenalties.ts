// Handler do `calculate-invoice-penalties`.
//
// A aritmetica de multa/juros e os filtros sao os mesmos de antes — multa
// `amount_cents * fineRatePct/100`, juros diarios limitados pelo teto mensal,
// `Math.round` nos tres, apenas `payment_type = 'dcc'` vencida. Nada de
// arredondamento, competencia, data ou timezone foi tocado (fica para o PR M).
//
// O que muda: exige credencial antes de qualquer query e aceita
// `{"validateOnly": true}` para calcular sem gravar.

import { requireFinanceAuth, type FinanceDependencies } from "./cronAuth.ts";
import { parseFinanceRequest } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PREVIEW_LIMIT = 5;

interface PenaltyPolicy {
  fineRatePct: number;
  dailyInterestPct: number;
  maxMonthlyInterestPct: number;
}

interface OverdueInvoice {
  id: string;
  amount_cents: number;
  due_date: string;
  status: string;
}

export async function handleCalculateInvoicePenalties(
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

    const { data: policies, error: policyErr } = await supabase
      .from("policies")
      .select("key, value")
      .in("key", ["fine_rate_pct", "daily_interest_rate_pct", "max_monthly_interest_pct"]);

    // Fail-closed antes de ler ou atualizar qualquer cobranca: se a leitura
    // das policies falhar, cair nos defaults (2% / 0,033% / 1%) gravaria
    // multa e juros com taxa que talvez nao seja a configurada. Ausencia de
    // linha continua sendo caso normal — ai o default e a regra.
    if (policyErr) {
      console.error("penalty policy lookup failed:", policyErr.message);
      return json(
        {
          error: "Falha ao carregar as políticas de multa e juros",
          stage: "policies",
          validate_only: validateOnly,
        },
        500,
      );
    }

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

    if (validateOnly) {
      return previewPenalties(overdueInvoices ?? [], today, {
        fineRatePct,
        dailyInterestPct,
        maxMonthlyInterestPct,
      });
    }

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
}

/**
 * Recalcula exatamente o que a execucao real gravaria, sem gravar. O corpo do
 * loop repete a mesma aritmetica de proposito: se a formula divergir daqui,
 * o teste de paridade quebra.
 */
function previewPenalties(
  overdueInvoices: OverdueInvoice[],
  today: string,
  policy: PenaltyPolicy,
): Response {
  let wouldUpdate = 0;
  let wouldChangeStatus = 0;
  const preview: Array<Record<string, unknown>> = [];

  for (const inv of overdueInvoices) {
    const dueDate = new Date(inv.due_date + "T00:00:00");
    const todayDate = new Date(today + "T00:00:00");
    const daysOverdue = Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysOverdue <= 0) continue;

    const fineAmountCents = Math.round(inv.amount_cents * (policy.fineRatePct / 100));
    const dailyInterestCents = Math.round(inv.amount_cents * (policy.dailyInterestPct / 100));
    const maxInterestCents = Math.round(inv.amount_cents * (policy.maxMonthlyInterestPct / 100));
    const totalInterestCents = Math.min(dailyInterestCents * daysOverdue, maxInterestCents);

    wouldUpdate++;
    if (inv.status === "pending") wouldChangeStatus++;

    if (preview.length < PREVIEW_LIMIT) {
      preview.push({
        id: inv.id,
        days_overdue: daysOverdue,
        fine_amount_cents: fineAmountCents,
        interest_amount_cents: totalInterestCents,
        status_change: inv.status === "pending" ? "overdue" : null,
      });
    }
  }

  return json({
    success: true,
    validate_only: true,
    total_overdue: overdueInvoices.length,
    would_update: wouldUpdate,
    would_change_status: wouldChangeStatus,
    config: policy,
    preview,
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
