import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ContractStatus = Database["public"]["Enums"]["contract_status"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
type PlanDuration = Database["public"]["Enums"]["plan_duration"];

export interface Contract {
  id: string;
  student_id: string;
  plan_id: string;
  start_date: string;
  end_date: string | null;
  status: ContractStatus;
  monthly_value_cents: number | null;
  total_value_cents: number | null;
  discount_cents: number | null;
  payment_method: PaymentMethod | null;
  payment_day: number | null;
  installments: number | null;
  total_paid_cents: number | null;
  card_last_four: string | null;
  card_brand: string | null;
  notes: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  student?: { full_name: string };
  plan?: { name: string; category: string; price_cents: number; duration: PlanDuration };
}

export interface ContractFormData {
  student_id: string;
  plan_id: string;
  start_date: string;
  end_date?: string;
  status?: ContractStatus;
  monthly_value_cents?: number;
  total_value_cents?: number;
  discount_cents?: number;
  payment_method?: PaymentMethod;
  payment_day?: number;
  installments?: number;
  card_last_four?: string;
  card_brand?: string;
  notes?: string;
}

export const contractStatusLabels: Record<ContractStatus, string> = {
  active: "Ativo",
  suspended: "Suspenso",
  cancelled: "Cancelado",
  expired: "Expirado",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  dcc: "DCC (Recorrente)",
  card_machine: "Máquina (Rede)",
  pix: "PIX",
  cash: "Dinheiro",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  boleto: "Boleto",
  transfer: "Transferência",
};

/** Payment methods available in the contract form */
export const activePaymentMethods: PaymentMethod[] = ["dcc", "card_machine", "pix", "cash"];

/** Map plan duration to default DCC installments */
export const durationToInstallments: Record<string, number> = {
  anual: 12,
  semestral: 6,
  trimestral: 3,
  mensal: 1,
  avulso: 1,
  unico: 1,
};

export function useContracts(statusFilter: "all" | ContractStatus = "all") {
  return useQuery({
    queryKey: ["contracts", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("contracts")
        .select("*, student:students(full_name), plan:plans(name, category, price_cents, duration)")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Contract[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: ContractFormData & { installment_dates?: string[] }) => {
      const { installment_dates, ...contractData } = data;

      const { data: created, error } = await supabase.from("contracts").insert({
        student_id: contractData.student_id,
        plan_id: contractData.plan_id,
        start_date: contractData.start_date,
        end_date: contractData.end_date || null,
        status: contractData.status ?? "active",
        monthly_value_cents: contractData.monthly_value_cents ?? null,
        total_value_cents: contractData.total_value_cents ?? null,
        discount_cents: contractData.discount_cents ?? 0,
        payment_method: contractData.payment_method ?? null,
        payment_day: contractData.payment_day ?? null,
        installments: contractData.installments ?? null,
        card_last_four: contractData.card_last_four || null,
        card_brand: contractData.card_brand || null,
        notes: contractData.notes || null,
      }).select("id").single();
      if (error) throw error;

      // Generate charges via edge function
      if (created?.id) {
        const { error: fnErr } = await supabase.functions.invoke("generate-monthly-invoices", {
          body: {
            mode: "contract-created",
            contract_id: created.id,
            installment_dates: installment_dates || [],
          },
        });
        if (fnErr) console.error("Error generating charges:", fnErr);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Contrato criado e cobranças geradas!");
    },
    onError: () => toast.error("Erro ao criar contrato."),
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ContractFormData> }) => {
      const { error } = await supabase.from("contracts").update({
        ...data,
        end_date: data.end_date || null,
        notes: data.notes || null,
        card_last_four: data.card_last_four || null,
        card_brand: data.card_brand || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Contrato atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar contrato."),
  });
}
