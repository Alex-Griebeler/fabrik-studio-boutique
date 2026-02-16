import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Matching inteligente: cruza transações bancárias não conciliadas
 * com invoices (créditos) e expenses (débitos) pendentes.
 *
 * Critérios de match:
 *  - Valor exato (amount_cents)
 *  - Data próxima (±5 dias entre posted_date e due_date)
 *  - Bonus: nome/documento na descrição
 *
 * Confiança: "high" (valor+data exata), "medium" (valor+data próxima), "low" (apenas valor)
 */

interface MatchSuggestion {
  transaction_id: string;
  matched_type: "invoice" | "expense";
  matched_id: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Não autorizado" }, 401);
    }
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey;
    const { data: { user }, error: authErr } = await createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    }).auth.getUser();
    if (authErr || !user) return json({ error: "Não autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    const importId: string | null = body.import_id ?? null;
    const autoApply: boolean = body.auto_apply ?? false;

    // 1. Fetch unmatched bank transactions
    let txQuery = supabase
      .from("bank_transactions")
      .select("*")
      .eq("match_status", "unmatched")
      .eq("is_balance_entry", false);
    if (importId) txQuery = txQuery.eq("import_id", importId);

    const { data: transactions, error: txErr } = await txQuery;
    if (txErr) return json({ error: "Erro ao buscar transações", details: txErr.message }, 500);
    if (!transactions || transactions.length === 0) {
      return json({ success: true, message: "Nenhuma transação não conciliada", matches: [], stats: { total: 0, matched: 0 } });
    }

    // 2. Fetch pending invoices (for credit matching)
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, amount_cents, due_date, student_id, reference_month, contract_id")
      .in("status", ["pending", "overdue"]);

    // 3. Fetch pending expenses (for debit matching)
    const { data: expenses } = await supabase
      .from("expenses")
      .select("id, amount_cents, due_date, description, category_id")
      .eq("status", "pending");

    // 4. Also fetch student names for better matching
    const studentIds = [...new Set((invoices ?? []).map(i => i.student_id).filter(Boolean))];
    let studentMap = new Map<string, string>();
    if (studentIds.length > 0) {
      const { data: students } = await supabase
        .from("students")
        .select("id, full_name")
        .in("id", studentIds);
      students?.forEach(s => studentMap.set(s.id, s.full_name.toUpperCase()));
    }

    const suggestions: MatchSuggestion[] = [];
    const usedInvoices = new Set<string>();
    const usedExpenses = new Set<string>();

    for (const tx of transactions) {
      const absCents = Math.abs(tx.amount_cents);
      const txDate = new Date(tx.posted_date + "T00:00:00");
      const memoUpper = (tx.memo ?? "").toUpperCase();
      const parsedNameUpper = (tx.parsed_name ?? "").toUpperCase();

      if (tx.transaction_type === "credit" && invoices) {
        // Match credits against invoices
        let bestMatch: { id: string; confidence: "high" | "medium" | "low"; reason: string } | null = null;

        for (const inv of invoices) {
          if (usedInvoices.has(inv.id)) continue;
          if (inv.amount_cents !== absCents) continue;

          // Value matches — check date proximity
          const invDate = new Date(inv.due_date + "T00:00:00");
          const daysDiff = Math.abs((txDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));

          // Check if student name appears in memo
          const studentName = inv.student_id ? studentMap.get(inv.student_id) : null;
          const nameMatch = studentName && (memoUpper.includes(studentName) || parsedNameUpper.includes(studentName));

          let confidence: "high" | "medium" | "low";
          let reason: string;

          if (daysDiff <= 1 && nameMatch) {
            confidence = "high";
            reason = `Valor exato (${fmtCents(absCents)}), data coincide, nome do aluno encontrado`;
          } else if (daysDiff <= 1) {
            confidence = "high";
            reason = `Valor exato (${fmtCents(absCents)}) e data coincide (${tx.posted_date})`;
          } else if (daysDiff <= 5) {
            confidence = "medium";
            reason = `Valor exato (${fmtCents(absCents)}), data próxima (${Math.round(daysDiff)} dias)`;
          } else if (daysDiff <= 15) {
            confidence = "low";
            reason = `Valor exato (${fmtCents(absCents)}), data distante (${Math.round(daysDiff)} dias)`;
          } else {
            continue; // too far apart
          }

          // Pick best match (higher confidence wins, then closer date)
          if (!bestMatch || confScore(confidence) > confScore(bestMatch.confidence) ||
              (confScore(confidence) === confScore(bestMatch.confidence) && daysDiff < 5)) {
            bestMatch = { id: inv.id, confidence, reason };
          }
        }

        if (bestMatch) {
          suggestions.push({
            transaction_id: tx.id,
            matched_type: "invoice",
            matched_id: bestMatch.id,
            confidence: bestMatch.confidence,
            reason: bestMatch.reason,
          });
          usedInvoices.add(bestMatch.id);
        }
      } else if (tx.transaction_type === "debit" && expenses) {
        // Match debits against expenses
        let bestMatch: { id: string; confidence: "high" | "medium" | "low"; reason: string } | null = null;

        for (const exp of expenses) {
          if (usedExpenses.has(exp.id)) continue;
          if (exp.amount_cents !== absCents) continue;

          const expDate = new Date(exp.due_date + "T00:00:00");
          const daysDiff = Math.abs((txDate.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24));

          // Check if expense description appears in memo
          const descMatch = exp.description && memoUpper.includes(exp.description.toUpperCase().substring(0, 10));

          let confidence: "high" | "medium" | "low";
          let reason: string;

          if (daysDiff <= 1 && descMatch) {
            confidence = "high";
            reason = `Valor exato (${fmtCents(absCents)}), data coincide, descrição encontrada`;
          } else if (daysDiff <= 1) {
            confidence = "high";
            reason = `Valor exato (${fmtCents(absCents)}) e data coincide`;
          } else if (daysDiff <= 5) {
            confidence = "medium";
            reason = `Valor exato (${fmtCents(absCents)}), data próxima (${Math.round(daysDiff)} dias)`;
          } else if (daysDiff <= 15) {
            confidence = "low";
            reason = `Valor exato (${fmtCents(absCents)}), data distante (${Math.round(daysDiff)} dias)`;
          } else {
            continue;
          }

          if (!bestMatch || confScore(confidence) > confScore(bestMatch.confidence)) {
            bestMatch = { id: exp.id, confidence, reason };
          }
        }

        if (bestMatch) {
          suggestions.push({
            transaction_id: tx.id,
            matched_type: "expense",
            matched_id: bestMatch.id,
            confidence: bestMatch.confidence,
            reason: bestMatch.reason,
          });
          usedExpenses.add(bestMatch.id);
        }
      }
    }

    // 5. If auto_apply, apply high-confidence matches directly
    let applied = 0;
    if (autoApply) {
      const highMatches = suggestions.filter(s => s.confidence === "high");
      for (const m of highMatches) {
        const updateData: Record<string, unknown> = {
          match_status: "auto_matched",
          match_confidence: m.confidence,
          matched_at: new Date().toISOString(),
          matched_by: user.id,
        };
        if (m.matched_type === "invoice") {
          updateData.matched_invoice_id = m.matched_id;
        } else {
          updateData.matched_expense_id = m.matched_id;
        }
        const { error } = await supabase
          .from("bank_transactions")
          .update(updateData)
          .eq("id", m.transaction_id);
        
        if (!error) {
          applied++;
          // Also update the matched record status
          if (m.matched_type === "invoice") {
            await supabase.from("invoices").update({
              status: "paid",
              payment_date: transactions.find(t => t.id === m.transaction_id)?.posted_date,
            }).eq("id", m.matched_id);
          } else {
            await supabase.from("expenses").update({
              status: "paid",
              payment_date: transactions.find(t => t.id === m.transaction_id)?.posted_date,
            }).eq("id", m.matched_id);
          }
        }
      }
    }

    return json({
      success: true,
      matches: suggestions,
      stats: {
        total_transactions: transactions.length,
        total_matches: suggestions.length,
        high_confidence: suggestions.filter(s => s.confidence === "high").length,
        medium_confidence: suggestions.filter(s => s.confidence === "medium").length,
        low_confidence: suggestions.filter(s => s.confidence === "low").length,
        auto_applied: applied,
      },
    });
  } catch (error) {
    console.error("Match error:", error);
    return json({ error: "Erro inesperado", details: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});

function confScore(c: string): number {
  return c === "high" ? 3 : c === "medium" ? 2 : 1;
}

function fmtCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
