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
 *  - Valor exato ou aproximado (tolerância ±R$ 0,50 = 50 cents)
 *  - Data próxima (±5 dias entre posted_date e due_date)
 *  - Bonus: nome/documento na descrição
 *  - Detecção especial de transações Rede (maquininha)
 *
 * Confiança: "high" (valor+data exata), "medium" (valor+data próxima), "low" (apenas valor)
 */

const TOLERANCE_CENTS = 50; // ±R$ 0,50

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
      return json({ success: true, message: "Nenhuma transação não conciliada", matches: [], stats: { total_transactions: 0, total_matches: 0, high_confidence: 0, medium_confidence: 0, low_confidence: 0, auto_applied: 0 } });
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

    // 4. Fetch student names for better matching
    const studentIds = [...new Set((invoices ?? []).map(i => i.student_id).filter(Boolean))];
    const studentMap = new Map<string, string>();
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
      const isRedeTransaction = memoUpper.includes("REDE") || memoUpper.includes("REDECARD") || tx.parsed_type?.startsWith("card_");

      if (tx.transaction_type === "credit" && invoices) {
        let bestMatch: { id: string; confidence: "high" | "medium" | "low"; reason: string; feeCents: number } | null = null;

        for (const inv of invoices) {
          if (usedInvoices.has(inv.id)) continue;

          // Check value match with tolerance
          const valueDiff = Math.abs(inv.amount_cents - absCents);
          const isExactMatch = valueDiff === 0;
          const isApproxMatch = valueDiff > 0 && valueDiff <= TOLERANCE_CENTS;

          // For Rede transactions, allow larger tolerance (processor fees)
          const isRedeMatch = isRedeTransaction && absCents < inv.amount_cents && (inv.amount_cents - absCents) <= Math.round(inv.amount_cents * 0.05); // up to 5% fee

          if (!isExactMatch && !isApproxMatch && !isRedeMatch) continue;

          const invDate = new Date(inv.due_date + "T00:00:00");
          const daysDiff = Math.abs((txDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));

          const studentName = inv.student_id ? studentMap.get(inv.student_id) : null;
          const nameMatch = studentName && (memoUpper.includes(studentName) || parsedNameUpper.includes(studentName));

          let confidence: "high" | "medium" | "low";
          let reason: string;
          let feeCents = 0;

          if (isRedeMatch) {
            feeCents = inv.amount_cents - absCents;
            if (daysDiff <= 5) {
              confidence = "high";
              reason = `Rede: valor líquido ${fmtCents(absCents)} (taxa ${fmtCents(feeCents)}), data próxima`;
            } else if (daysDiff <= 15) {
              confidence = "medium";
              reason = `Rede: valor líquido ${fmtCents(absCents)} (taxa ${fmtCents(feeCents)}), ${Math.round(daysDiff)} dias`;
            } else {
              continue;
            }
          } else if (isExactMatch) {
            if (daysDiff <= 1 && nameMatch) {
              confidence = "high";
              reason = `Valor exato (${fmtCents(absCents)}), data coincide, nome encontrado`;
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
          } else {
            // Approximate match
            if (daysDiff <= 3) {
              confidence = "medium";
              reason = `Valor aproximado (${fmtCents(absCents)} ≈ ${fmtCents(inv.amount_cents)}), data próxima`;
            } else if (daysDiff <= 10) {
              confidence = "low";
              reason = `Valor aproximado (${fmtCents(absCents)} ≈ ${fmtCents(inv.amount_cents)}), ${Math.round(daysDiff)} dias`;
            } else {
              continue;
            }
          }

          if (!bestMatch || confScore(confidence) > confScore(bestMatch.confidence) ||
              (confScore(confidence) === confScore(bestMatch.confidence) && daysDiff < 5)) {
            bestMatch = { id: inv.id, confidence, reason, feeCents };
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

          // Record processor fee if Rede transaction
          if (bestMatch.feeCents > 0) {
            await supabase
              .from("bank_transactions")
              .update({ processor_fee_cents: bestMatch.feeCents })
              .eq("id", tx.id);
          }
        }
      } else if (tx.transaction_type === "debit" && expenses) {
        let bestMatch: { id: string; confidence: "high" | "medium" | "low"; reason: string } | null = null;

        for (const exp of expenses) {
          if (usedExpenses.has(exp.id)) continue;

          const valueDiff = Math.abs(exp.amount_cents - absCents);
          const isExactMatch = valueDiff === 0;
          const isApproxMatch = valueDiff > 0 && valueDiff <= TOLERANCE_CENTS;

          if (!isExactMatch && !isApproxMatch) continue;

          const expDate = new Date(exp.due_date + "T00:00:00");
          const daysDiff = Math.abs((txDate.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24));

          const descMatch = exp.description && memoUpper.includes(exp.description.toUpperCase().substring(0, 10));

          let confidence: "high" | "medium" | "low";
          let reason: string;

          if (isExactMatch) {
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
          } else {
            if (daysDiff <= 3) {
              confidence = "medium";
              reason = `Valor aproximado (${fmtCents(absCents)} ≈ ${fmtCents(exp.amount_cents)}), data próxima`;
            } else if (daysDiff <= 10) {
              confidence = "low";
              reason = `Valor aproximado (${fmtCents(absCents)} ≈ ${fmtCents(exp.amount_cents)}), ${Math.round(daysDiff)} dias`;
            } else {
              continue;
            }
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

    // 6. Auto-create fee expenses for Rede transactions with processor_fee_cents > 0
    if (autoApply) {
      const redeMatches = suggestions.filter(s => s.reason.includes("Rede:"));
      for (const m of redeMatches) {
        const tx = transactions.find(t => t.id === m.transaction_id);
        if (!tx || !tx.processor_fee_cents || tx.processor_fee_cents <= 0) continue;

        // Find or create "Taxas Maquininha" category
        let { data: taxaCat } = await supabase
          .from("expense_categories")
          .select("id")
          .eq("slug", "taxas-maquininha")
          .limit(1);

        if (!taxaCat || taxaCat.length === 0) {
          const { data: newCat } = await supabase
            .from("expense_categories")
            .insert({ name: "Taxas Maquininha", slug: "taxas-maquininha", color: "orange", sort_order: 99 })
            .select("id");
          taxaCat = newCat;
        }

        if (taxaCat && taxaCat.length > 0) {
          await supabase.from("expenses").insert({
            category_id: taxaCat[0].id,
            description: `Taxa Rede - ${tx.memo}`,
            amount_cents: tx.processor_fee_cents,
            due_date: tx.posted_date,
            payment_date: tx.posted_date,
            status: "paid",
            notes: `Taxa da maquininha Rede detectada automaticamente na conciliação`,
          });
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
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
