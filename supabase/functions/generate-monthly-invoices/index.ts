import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Gera faturas mensais automaticamente a partir de contratos ativos.
 * Executada via Cron no dia 1 de cada mês (ou manualmente).
 *
 * - Busca contratos ativos
 * - Calcula valor líquido (mensal - desconto)
 * - Usa payment_day do contrato como dia de vencimento
 * - Verifica duplicidade por contract_id + competence_date
 * - Gera invoice_number sequencial: FAT-YYYY-NNNNN
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: accept service role (cron) or authenticated user
    const authHeader = req.headers.get("Authorization");
    const isServiceCall = authHeader?.includes(serviceKey);

    if (!isServiceCall && authHeader) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey;
      const { error: authErr } = await createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      }).auth.getUser();
      if (authErr) return json({ error: "Não autorizado" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const targetMonth = body.target_month; // optional: "YYYY-MM-DD"

    const now = new Date();
    const competenceDate = targetMonth
      ? new Date(targetMonth + "T00:00:00")
      : new Date(now.getFullYear(), now.getMonth(), 1);

    const competenceStr = competenceDate.toISOString().substring(0, 10);
    const year = competenceDate.getFullYear();
    const month = competenceDate.getMonth() + 1;

    console.log(`Generating invoices for competence: ${competenceStr}`);

    // 1. Fetch active contracts with plan info
    const { data: contracts, error: cErr } = await supabase
      .from("contracts")
      .select("id, student_id, plan_id, monthly_value_cents, discount_cents, payment_day, start_date, end_date")
      .eq("status", "active");

    if (cErr) return json({ error: "Erro ao buscar contratos", details: cErr.message }, 500);
    if (!contracts || contracts.length === 0) {
      return json({ success: true, message: "Nenhum contrato ativo", created: 0 });
    }

    // 2. Check existing invoices for this competence to avoid duplicates
    const contractIds = contracts.map(c => c.id);
    const { data: existing } = await supabase
      .from("invoices")
      .select("contract_id")
      .eq("competence_date", competenceStr)
      .in("contract_id", contractIds);

    const existingSet = new Set((existing ?? []).map(e => e.contract_id));

    // 3. Get last invoice number for sequential numbering
    const { data: lastInv } = await supabase
      .from("invoices")
      .select("invoice_number")
      .like("invoice_number", `FAT-${year}-%`)
      .order("invoice_number", { ascending: false })
      .limit(1);

    let seq = 1;
    if (lastInv && lastInv.length > 0 && lastInv[0].invoice_number) {
      const parts = lastInv[0].invoice_number.split("-");
      const lastNum = parseInt(parts[2]);
      if (!isNaN(lastNum)) seq = lastNum + 1;
    }

    // 4. Generate invoices
    const invoicesToCreate = [];
    for (const contract of contracts) {
      if (existingSet.has(contract.id)) continue;

      // Skip if contract hasn't started yet
      if (contract.start_date && new Date(contract.start_date) > competenceDate) continue;

      // Skip if contract has ended
      if (contract.end_date && new Date(contract.end_date) < competenceDate) continue;

      const amountCents = (contract.monthly_value_cents ?? 0) - (contract.discount_cents ?? 0);
      if (amountCents <= 0) continue;

      const paymentDay = contract.payment_day ?? 10;
      const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(Math.min(paymentDay, 28)).padStart(2, "0")}`;
      const invoiceNumber = `FAT-${year}-${String(seq).padStart(5, "0")}`;

      invoicesToCreate.push({
        contract_id: contract.id,
        student_id: contract.student_id,
        amount_cents: amountCents,
        due_date: dueDate,
        competence_date: competenceStr,
        invoice_number: invoiceNumber,
        status: "pending",
        reference_month: `${year}-${String(month).padStart(2, "0")}`,
      });
      seq++;
    }

    let created = 0;
    if (invoicesToCreate.length > 0) {
      const { data: ins, error: iErr } = await supabase
        .from("invoices")
        .insert(invoicesToCreate)
        .select("id");

      if (iErr) {
        console.error("Error creating invoices:", iErr.message);
        return json({ error: "Erro ao criar faturas", details: iErr.message }, 500);
      }
      created = ins?.length ?? 0;
    }

    console.log(`Created ${created} invoices for ${competenceStr}`);

    // 5. Generate recurring expenses
    let recurringCreated = 0;
    const { data: recurringExpenses } = await supabase
      .from("expenses")
      .select("*")
      .eq("is_recurring", true)
      .or(`recurring_until.is.null,recurring_until.gte.${competenceStr}`);

    if (recurringExpenses && recurringExpenses.length > 0) {
      const expensesToCreate = [];
      for (const exp of recurringExpenses) {
        // Check if already generated for this month
        const { data: existingExp } = await supabase
          .from("expenses")
          .select("id")
          .eq("parent_expense_id", exp.id)
          .eq("competence_date", competenceStr)
          .limit(1);

        if (existingExp && existingExp.length > 0) continue;

        expensesToCreate.push({
          category_id: exp.category_id,
          description: exp.description,
          amount_cents: exp.amount_cents,
          due_date: `${year}-${String(month).padStart(2, "0")}-${String(new Date(exp.due_date).getDate()).padStart(2, "0")}`,
          status: "pending",
          payment_method: exp.payment_method,
          recurrence: exp.recurrence,
          notes: `Recorrência automática de: ${exp.description}`,
          supplier_id: exp.supplier_id,
          competence_date: competenceStr,
          parent_expense_id: exp.id,
          is_recurring: false,
        });
      }

      if (expensesToCreate.length > 0) {
        const { data: createdExp } = await supabase
          .from("expenses")
          .insert(expensesToCreate)
          .select("id");
        recurringCreated = createdExp?.length ?? 0;
      }
    }

    return json({
      success: true,
      competence: competenceStr,
      invoices_created: created,
      recurring_expenses_created: recurringCreated,
      skipped_duplicates: existingSet.size,
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
