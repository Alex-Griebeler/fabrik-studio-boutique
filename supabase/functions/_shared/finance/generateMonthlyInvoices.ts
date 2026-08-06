import { installmentDueDate } from "./dueDateRule.ts";

// Handler do `generate-monthly-invoices`.
//
// Os dois modos continuam identicos: `contract-created` (gera as parcelas do
// contrato) e `cron` (ativa DCC agendada + gera despesa recorrente do mes).
// Numero de parcela, arredondamento da ultima parcela, `FAT-<ano>-<seq>`,
// competencia e datas: tudo verbatim. Isso e PR M, nao aqui.
//
// Diferenca desta funcao para as outras duas: o frontend a chama com JWT de
// usuario em `useCreateContract` (src/hooks/useContracts.ts:131). Como
// `contracts_insert` exige `has_role(uid,'admin')`, quem chega ate aqui pelo
// app e necessariamente admin — entao a role `admin` continua aceita, e so
// ela. Sem credencial nenhuma agora e 401.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireFinanceAuth, type FinanceDependencies } from "./cronAuth.ts";
import { parseFinanceRequest } from "./logic.ts";
import type { StaffRole } from "../requireStaffRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Espelha `contracts_insert` / `invoices_insert`: só admin. */
const ALLOWED_STAFF_ROLES: ReadonlyArray<StaffRole> = ["admin"];

const PREVIEW_LIMIT = 5;

export async function handleGenerateMonthlyInvoices(
  req: Request,
  deps: FinanceDependencies,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireFinanceAuth(
    { req, allowStaffRoles: ALLOWED_STAFF_ROLES },
    deps,
  );
  if (auth instanceof Response) return auth;

  const supabase = auth.adminClient;

  try {
    const body = await req.json().catch(() => ({}));
    const { validateOnly } = parseFinanceRequest(body);
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

      if (netValue <= 0) {
        // Mesma decisão de negócio nos dois modos (nada a criar), mas o
        // validateOnly responde no seu próprio contrato: validate_only=true
        // e contagem zero, em vez do `created` da execução real.
        return validateOnly
          ? json({
            success: true,
            validate_only: true,
            mode: "contract-created",
            contract_id: contractId,
            message: "Valor líquido zerado",
            charges_to_create: 0,
            preview: [],
          })
          : json({ success: true, message: "Valor líquido zerado", created: 0 });
      }

      const installmentDates: string[] = body.installment_dates || [];
      const startDate = new Date(contract.start_date + "T00:00:00");

      // Get next invoice number
      const year = startDate.getFullYear();
      const { data: lastInv, error: lastInvErr } = await supabase
        .from("invoices")
        .select("invoice_number")
        .like("invoice_number", `FAT-${year}-%`)
        .order("invoice_number", { ascending: false })
        .limit(1);

      // Fail-closed antes de qualquer insert ou preview: se a leitura da
      // última numeração falhar, `seq` cairia para 1 e a função emitiria
      // FAT-<ano>-00001 por cima de faturas existentes. Numeração duplicada
      // é pior do que a chamada falhar, então aborta nos dois modos.
      if (lastInvErr) {
        console.error("invoice sequence lookup failed:", lastInvErr.message);
        return json(
          {
            error: "Falha ao resolver a sequência de cobranças",
            stage: "invoice_sequence",
            validate_only: validateOnly,
          },
          500,
        );
      }

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

          // Regra da Fabrik (dueDateRule.ts): cada aluna vence no SEU dia
          // do mês (payment_day; default = dia do início do contrato).
          // O comportamento antigo somava 30 dias e escorregava o
          // vencimento (10/01 → 09/02 → 11/03…); quem fechava dia 31
          // pulava fevereiro. Data explícita do caller tem precedência —
          // mas string vazia (campo apagado na UI) NÃO é data: cai na
          // regra em vez de estourar o NOT NULL do banco.
          const explicit = installmentDates[i]?.trim();
          const dueDate: string = explicit ||
            installmentDueDate({
              startDateISO: contract.start_date,
              paymentDay: contract.payment_day,
              installmentIndex: i,
            });

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
        // Single charge (card_machine, cash, single PIX) — também segue a
        // regra: com payment_day definido, vence na primeira ocorrência
        // do dia; sem payment_day a regra devolve o próprio start_date
        // (à vista no ato preservado). String vazia não é data.
        const explicitSingle = installmentDates[0]?.trim();
        const dueDate = explicitSingle ||
          installmentDueDate({
            startDateISO: contract.start_date,
            paymentDay: contract.payment_day,
            installmentIndex: 0,
          });
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

      // Ponto de corte do validateOnly: o conjunto de trabalho ja esta
      // resolvido e nada foi gravado.
      if (validateOnly) {
        return json({
          success: true,
          validate_only: true,
          mode: "contract-created",
          contract_id: contractId,
          payment_type: paymentType,
          charges_to_create: invoicesToCreate.length,
          preview: invoicesToCreate.slice(0, PREVIEW_LIMIT).map(inv => ({
            invoice_number: inv.invoice_number,
            amount_cents: inv.amount_cents,
            due_date: inv.due_date,
            status: inv.status,
            installment_number: inv.installment_number,
            total_installments: inv.total_installments,
          })),
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
    const { data: scheduledCharges, error: scheduledErr } = await supabase
      .from("invoices")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_date", today);

    if (validateOnly) {
      // Fail-safe: a execucao real ignora esse erro (comportamento antigo,
      // preservado abaixo), mas o validateOnly nao pode reportar "0 a ativar"
      // quando na verdade nao conseguiu ler.
      if (scheduledErr) {
        console.error("validateOnly aborted at scheduled:", scheduledErr.message);
        return json({ error: "Falha ao validar", stage: "scheduled", validate_only: true }, 500);
      }
      return await previewCron(supabase, scheduledCharges ?? []);
    }

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
}

/**
 * Espelho somente-leitura do modo cron. Repete os mesmos filtros de
 * competencia e dedupe da execucao real, mas para antes de qualquer insert.
 */
async function previewCron(
  supabase: SupabaseClient,
  scheduledCharges: Array<{ id: string }>,
): Promise<Response> {
  const now = new Date();
  const competenceDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const competenceStr = competenceDate.toISOString().substring(0, 10);

  const { data: recurringExpenses, error: recurErr } = await supabase
    .from("expenses")
    .select("*")
    .eq("is_recurring", true)
    .or(`recurring_until.is.null,recurring_until.gte.${competenceStr}`);

  if (recurErr) {
    console.error("validateOnly aborted at recurring:", recurErr.message);
    return json({ error: "Falha ao validar", stage: "recurring", validate_only: true }, 500);
  }

  const parentIds: string[] = [];
  for (const exp of recurringExpenses ?? []) {
    const { data: existingExp, error: existingErr } = await supabase
      .from("expenses")
      .select("id")
      .eq("parent_expense_id", exp.id)
      .eq("competence_date", competenceStr)
      .limit(1);

    if (existingErr) {
      console.error("validateOnly aborted at recurring_dedupe:", existingErr.message);
      return json({ error: "Falha ao validar", stage: "recurring_dedupe", validate_only: true }, 500);
    }
    if (existingExp && existingExp.length > 0) continue;

    parentIds.push(exp.id);
  }

  return json({
    success: true,
    validate_only: true,
    mode: "cron",
    scheduled_to_activate: scheduledCharges.length,
    recurring_expenses_to_create: parentIds.length,
    competence_date: competenceStr,
    preview: {
      scheduled_invoice_ids: scheduledCharges.slice(0, PREVIEW_LIMIT).map(c => c.id),
      recurring_parent_expense_ids: parentIds.slice(0, PREVIEW_LIMIT),
    },
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
