import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Gera cobranças para contratos.
 *
 * Dois modos de operação:
 * 1. "contract-created": recebe contract_id e gera cobranças conforme payment_method
 * 2. "cron" (default): verifica cobranças scheduled cuja data chegou + despesas recorrentes
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

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "cron";

    // ─── MODE: CONTRACT-CREATED ───
    if (mode === "contract-created") {
      const contractId = body.contract_id;
      if (!contractId) return json({ error: "contract_id é obrigatório" }, 400);

      const { data: contract, error: cErr } = await supabase
        .from("contracts")
        .select("*, plan:plans(name, duration, price_cents)")
        .eq("id", contractId)
        .single();

      if (cErr || !contract) return json({ error: "Contrato não encontrado", details: cErr?.message }, 404);

      const paymentMethod = contract.payment_method;
      const installments = contract.installments || 1;
      const totalValueCents = contract.total_value_cents || contract.monthly_value_cents || 0;
      const discountCents = contract.discount_cents || 0;
      const netValue = totalValueCents - discountCents;

      if (netValue <= 0) return json({ success: true, message: "Valor líquido zerado", created: 0 });

      const installmentDates: string[] = body.installment_dates || [];
      const startDate = new Date(contract.start_date + "T00:00:00");

      // Get next invoice number
      const year = startDate.getFullYear();
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

      let paymentType = "cash";
      if (paymentMethod === "dcc") paymentType = "dcc";
      else if (paymentMethod === "card_machine") paymentType = "card_machine";
      else if (paymentMethod === "pix") paymentType = "pix";
      else if (paymentMethod === "cash") paymentType = "cash";

      const invoicesToCreate = [];

      if ((paymentMethod === "dcc" || paymentMethod === "pix") && installments > 1) {
        // Multiple installments
        const baseAmount = Math.round(netValue / installments);
        
        for (let i = 0; i < installments; i++) {
          // Last installment absorbs rounding difference
          const amount = i === installments - 1 
            ? netValue - baseAmount * (installments - 1) 
            : baseAmount;

          let dueDate: string;
          if (installmentDates[i]) {
            dueDate = installmentDates[i];
          } else {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i * 30);
            dueDate = d.toISOString().substring(0, 10);
          }

          const invoiceNumber = `FAT-${year}-${String(seq).padStart(5, "0")}`;
          const status = paymentMethod === "dcc" ? "scheduled" : "pending";

          invoicesToCreate.push({
            contract_id: contractId,
            student_id: contract.student_id,
            amount_cents: amount,
            due_date: dueDate,
            scheduled_date: paymentMethod === "dcc" ? dueDate : null,
            status,
            payment_type: paymentType,
            installment_number: i + 1,
            total_installments: installments,
            invoice_number: invoiceNumber,
            reference_month: dueDate.substring(0, 7),
          });
          seq++;
        }
      } else {
        // Single charge (card_machine, cash, single PIX)
        const dueDate = installmentDates[0] || contract.start_date;
        const invoiceNumber = `FAT-${year}-${String(seq).padStart(5, "0")}`;

        invoicesToCreate.push({
          contract_id: contractId,
          student_id: contract.student_id,
          amount_cents: netValue,
          due_date: dueDate,
          scheduled_date: null,
          status: "pending",
          payment_type: paymentType,
          installment_number: 1,
          total_installments: 1,
          invoice_number: invoiceNumber,
          reference_month: dueDate.substring(0, 7),
        });
      }

      const { data: created, error: iErr } = await supabase
        .from("invoices")
        .insert(invoicesToCreate)
        .select("id");

      if (iErr) {
        console.error("Error creating charges:", iErr.message);
        return json({ error: "Erro ao criar cobranças", details: iErr.message }, 500);
      }

      console.log(`Created ${created?.length ?? 0} charges for contract ${contractId}`);

      return json({
        success: true,
        mode: "contract-created",
        contract_id: contractId,
        charges_created: created?.length ?? 0,
        payment_type: paymentType,
      });
    }

    // ─── MODE: CRON (daily) ───
    const today = new Date().toISOString().substring(0, 10);

    // 1. Activate scheduled DCC charges whose date has arrived
    const { data: scheduledCharges } = await supabase
      .from("invoices")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_date", today);

    let activated = 0;
    if (scheduledCharges && scheduledCharges.length > 0) {
      const ids = scheduledCharges.map(c => c.id);
      const { error: actErr } = await supabase
        .from("invoices")
        .update({ status: "pending" })
        .in("id", ids);
      if (!actErr) activated = ids.length;
      else console.error("Error activating scheduled charges:", actErr.message);
    }

    // 2. Generate recurring expenses (monthly cron)
    const now = new Date();
    const competenceDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const competenceStr = competenceDate.toISOString().substring(0, 10);
    const year = competenceDate.getFullYear();
    const month = competenceDate.getMonth() + 1;

    let recurringCreated = 0;
    const { data: recurringExpenses } = await supabase
      .from("expenses")
      .select("*")
      .eq("is_recurring", true)
      .or(`recurring_until.is.null,recurring_until.gte.${competenceStr}`);

    if (recurringExpenses && recurringExpenses.length > 0) {
      const expensesToCreate = [];
      for (const exp of recurringExpenses) {
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

    console.log(`Cron: ${activated} charges activated, ${recurringCreated} recurring expenses created`);

    return json({
      success: true,
      mode: "cron",
      scheduled_activated: activated,
      recurring_expenses_created: recurringCreated,
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
