import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export interface Invoice {
  id: string;
  contract_id: string;
  student_id: string | null;
  amount_cents: number;
  due_date: string;
  status: InvoiceStatus;
  reference_month: string | null;
  payment_date: string | null;
  paid_amount_cents: number | null;
  payment_method: PaymentMethod | null;
  payment_proof_url: string | null;
  invoice_number: string | null;
  fine_amount_cents: number | null;
  interest_amount_cents: number | null;
  competence_date: string | null;
  notes: string | null;
  payment_type: string | null;
  installment_number: number | null;
  total_installments: number | null;
  scheduled_date: string | null;
  created_at: string;
  updated_at: string;
  // joined
  student?: { full_name: string };
  contract?: { plan_id: string; plan?: { name: string } };
}

export interface InvoiceFormData {
  contract_id: string;
  student_id?: string;
  amount_cents: number;
  due_date: string;
  status?: InvoiceStatus;
  reference_month?: string;
  payment_date?: string;
  paid_amount_cents?: number;
  payment_method?: PaymentMethod;
  notes?: string;
}

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  scheduled: "Agendada",
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
};

export const invoiceStatusColors: Record<InvoiceStatus, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-muted text-muted-foreground",
};

export const paymentTypeLabels: Record<string, string> = {
  dcc: "DCC",
  card_machine: "Máquina",
  pix: "PIX",
  cash: "Dinheiro",
};

export function useInvoices(statusFilter: "all" | InvoiceStatus = "all") {
  return useQuery({
    queryKey: ["invoices", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, student:students(full_name)")
        .order("due_date", { ascending: false })
        .limit(1000);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Invoice[];
    },
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      const { error } = await supabase.from("invoices").insert({
        contract_id: data.contract_id,
        student_id: data.student_id || null,
        amount_cents: data.amount_cents,
        due_date: data.due_date,
        status: data.status ?? "pending",
        reference_month: data.reference_month || null,
        payment_date: data.payment_date || null,
        paid_amount_cents: data.paid_amount_cents ?? null,
        payment_method: data.payment_method ?? null,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Cobrança criada com sucesso!");
    },
    onError: () => toast.error("Erro ao criar cobrança."),
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InvoiceFormData> }) => {
      const { error } = await supabase.from("invoices").update({
        ...data,
        notes: data.notes || null,
      }).eq("id", id);
      if (error) throw error;

      // Se marcou como paga, disparar emissão de NF-e automaticamente
      if (data.status === "paid") {
        try {
          await supabase.functions.invoke("emit-nfse", {
            body: { invoice_id: id },
          });
        } catch {
          // Não bloquear o fluxo se a NF-e falhar
        }
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["nfse"] });
      if (variables.data.status === "paid") {
        toast.success("Pagamento registrado! NF-e sendo emitida automaticamente.");
      } else {
        toast.success("Cobrança atualizada!");
      }
    },
    onError: () => toast.error("Erro ao atualizar cobrança."),
  });
}
