// Handler do `match-bank-transactions`.
//
// Onda 2c-1: o matcher é SOMENTE-SUGESTÃO. O bloco de aplicação (reservar a
// transação, quitar fatura/despesa, criar despesa de taxa) foi removido por
// inteiro — era o modelo velho em que "conciliar" significava "quitar", e é
// exatamente o que a Onda 2c aposenta (aprovar = vincular, via RPC
// transacional que chega na 2c-3). Este handler não executa NENHUMA escrita.
//
// A lógica de sugestão (tolerâncias, confiança, detecção Rede) segue a mesma.
// Vive em `_shared/` por dois motivos: o vitest so coleta teste em
// `supabase/functions/_shared/**`, e aqui o modulo fica sem import de VALOR do
// SDK — `createClient` chega por injecao —, o que permite testar o handler
// inteiro (auth, contrato, ausência de escrita) sem rede.

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
 * Sugestão de vínculos: cruza transações bancárias não conciliadas
 * com invoices (créditos) e expenses (débitos) pendentes.
 *
 * Critérios:
 *  - Valor exato ou aproximado (tolerância ±R$ 0,50 = 50 cents)
 *  - Data próxima (±5 dias entre posted_date e due_date)
 *  - Bonus: nome/documento na descrição
 *  - Detecção especial de repasse Rede (líquido até 5% abaixo, taxa estimada)
 *
 * Confiança: "high" (valor+data exata), "medium" (valor+data próxima),
 * "low" (apenas valor). A taxa Rede aparece só no texto do motivo — nada é
 * gravado em lugar nenhum.
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
    // Fail-closed: exige JWT de staff admin ANTES de qualquer leitura.
    const auth = await requireBankStaff(req, deps);
    if (auth instanceof Response) return auth;

    const supabase = auth.adminClient;

    const request = parseMatchRequest(await req.json().catch(() => ({})));
    if (isBankRequestError(request)) {
      return json({ error: request.error }, request.status);
    }
    const { importId } = request;

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
      return json({ success: true, message: "Nenhuma transação não conciliada", matches: [], stats: { total_transactions: 0, total_matches: 0, high_confidence: 0, medium_confidence: 0, low_confidence: 0 } });
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
        let bestMatch: { id: string; confidence: "high" | "medium" | "low"; reason: string } | null = null;

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

          if (isRedeMatch) {
            // Taxa estimada aparece SÓ no texto: nada é gravado (o modelo de
            // settlement com ajustes tipados chega na 2c-3).
            const feeCents = inv.amount_cents - absCents;
            if (daysDiff <= 5) {
              confidence = "high";
              reason = `Rede: valor líquido ${fmtCents(absCents)} (taxa estimada ${fmtCents(feeCents)}), data próxima`;
            } else if (daysDiff <= 15) {
              confidence = "medium";
              reason = `Rede: valor líquido ${fmtCents(absCents)} (taxa estimada ${fmtCents(feeCents)}), ${Math.round(daysDiff)} dias`;
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

    return json({
      success: true,
      matches: suggestions,
      stats: {
        total_transactions: transactions.length,
        total_matches: suggestions.length,
        high_confidence: suggestions.filter(s => s.confidence === "high").length,
        medium_confidence: suggestions.filter(s => s.confidence === "medium").length,
        low_confidence: suggestions.filter(s => s.confidence === "low").length,
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
