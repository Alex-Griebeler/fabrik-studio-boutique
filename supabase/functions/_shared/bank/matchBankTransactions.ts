// Handler do `match-bank-transactions`.
//
// A logica de matching (tolerancias, confianca, deteccao Rede) e a mesma de
// antes. Vive em `_shared/` por dois motivos: o vitest so coleta teste em
// `supabase/functions/_shared/**`, e aqui o modulo fica sem import de VALOR do
// SDK — `createClient` chega por injecao —, o que permite testar o handler
// inteiro (auth, preview sem escrita, aplicacao) sem rede.

import {
  isBankRequestError,
  parseMatchRequest,
  requireBankStaff,
  type BankDependencies,
} from "./bankAuth.ts";

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

export async function handleMatchBankTransactions(
  req: Request,
  deps: BankDependencies,
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Fail-closed: exige JWT de staff admin/manager ANTES de qualquer
    // leitura. Antes bastava estar autenticado — JWT de aluno passava e
    // conseguia conciliar todo o financeiro.
    const auth = await requireBankStaff(req, deps);
    if (auth instanceof Response) return auth;

    const supabase = auth.adminClient;
    const matchedBy = auth.userId;

    const request = parseMatchRequest(await req.json().catch(() => ({})));
    if (isBankRequestError(request)) {
      return json({ error: request.error }, request.status);
    }
    const { importId, autoApply } = request;

    // 1. Fetch unmatched bank transactions
    let txQuery = supabase
      .from("bank_transactions")
      .select("*")
      .eq("match_status", "unmatched")
      .eq("is_balance_entry", false);
    if (importId) txQuery = txQuery.eq("import_id", importId);

    const { data: transactions, error: txErr } = await txQuery;
    if (txErr) {
      console.error("match-bank-transactions: tx fetch failed", txErr.message);
      return json({ error: "Erro ao buscar transações" }, 500);
    }
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
    /** Taxas de maquininha detectadas; so gravadas quando autoApply. */
    const pendingFees = new Map<string, number>();

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

          // Taxa de maquininha: so anotada em memoria aqui. A gravacao ficou
          // no bloco de autoApply — sem isso, o "simular conciliacao" da tela
          // escrevia em bank_transactions, e preview que grava nao e preview.
          if (bestMatch.feeCents > 0) {
            pendingFees.set(tx.id, bestMatch.feeCents);
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
    let failed = 0;
    /** Taxas efetivamente gravadas, por transacao aplicada. Alimenta o passo 6. */
    const appliedFees = new Map<string, number>();
    if (autoApply) {
      const highMatches = suggestions.filter(s => s.confidence === "high");
      for (const m of highMatches) {
        // Ordem deliberada: quita a fatura/despesa ANTES de marcar a transacao
        // como conciliada. Se este passo falhar, a transacao segue `unmatched`
        // e uma nova execucao tenta de novo. No sentido inverso, a transacao
        // sairia do filtro `unmatched` e o retry nunca mais a alcancaria —
        // ficaria conciliada com a fatura ainda em aberto, em silencio.
        const matchedTx = transactions.find(t => t.id === m.transaction_id);
        const { error: linkError } = m.matched_type === "invoice"
          ? await supabase.from("invoices").update({
            status: "paid",
            payment_date: matchedTx?.posted_date,
            paid_amount_cents: matchedTx ? Math.abs(matchedTx.amount_cents) : null,
          }).eq("id", m.matched_id)
          : await supabase.from("expenses").update({
            status: "paid",
            payment_date: matchedTx?.posted_date,
          }).eq("id", m.matched_id);

        if (linkError) {
          failed++;
          console.error(
            `match-bank-transactions: falha ao quitar ${m.matched_type} do match`,
            linkError.message,
          );
          continue;
        }

        const updateData: Record<string, unknown> = {
          match_status: "auto_matched",
          match_confidence: m.confidence,
          matched_at: new Date().toISOString(),
          matched_by: matchedBy,
        };
        if (m.matched_type === "invoice") {
          updateData.matched_invoice_id = m.matched_id;
        } else {
          updateData.matched_expense_id = m.matched_id;
        }

        // Taxa de maquininha: gravada junto do proprio match. Antes o preview
        // gravava a taxa de qualquer sugestao, e a despesa correspondente so
        // nascia numa execucao seguinte, quando a transacao era relida ja com
        // a taxa. Como a transacao aplicada vira `auto_matched` e sai do filtro
        // `unmatched`, essa segunda passada deixou de existir: o valor
        // calculado aqui e a unica fonte.
        const feeCents = pendingFees.get(m.transaction_id);
        if (feeCents && feeCents > 0) updateData.processor_fee_cents = feeCents;

        const { error } = await supabase
          .from("bank_transactions")
          .update(updateData)
          .eq("id", m.transaction_id);

        if (error) {
          // A fatura ja foi quitada acima. Ela sai de `pending`/`overdue`, entao
          // uma nova execucao nao a casa de novo — nao ha risco de aplicar duas
          // vezes; a transacao apenas fica para conciliacao manual.
          failed++;
          console.error(
            "match-bank-transactions: falha ao marcar transação conciliada",
            error.message,
          );
          continue;
        }

        applied++;
        if (feeCents && feeCents > 0) appliedFees.set(m.transaction_id, feeCents);
      }
    }

    // 6. Auto-create fee expenses for Rede transactions with processor_fee_cents > 0
    //
    // Itera sobre as taxas gravadas no passo 5, e nao mais sobre o array
    // `transactions` — aquele foi carregado ANTES do update e traz
    // `processor_fee_cents` nulo para transacao nova, o que fazia o laco
    // pular sempre e a despesa nunca ser criada.
    if (autoApply) {
      for (const [transactionId, feeCents] of appliedFees) {
        const tx = transactions.find(t => t.id === transactionId);
        if (!tx) continue;

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
            amount_cents: feeCents,
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
        // Match de alta confianca que nao pode ser aplicado. Antes esses erros
        // eram engolidos e a resposta dizia sucesso mesmo com a fatura em
        // aberto; agora aparecem para quem chamou.
        auto_failed: failed,
      },
    });
  } catch (error) {
    console.error("Match error:", error);
    console.error("match-bank-transactions fatal:", error instanceof Error ? error.message : error);
    return json({ error: "Erro inesperado" }, 500);
  }
}

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
