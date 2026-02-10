import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ContractStatus = Database["public"]["Enums"]["contract_status"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];

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
  notes: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  student?: { full_name: string };
  plan?: { name: string; category: string; price_cents: number };
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
  notes?: string;
}

export const contractStatusLabels: Record<ContractStatus, string> = {
  active: "Ativo",
  suspended: "Suspenso",
  cancelled: "Cancelado",
  expired: "Expirado",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  boleto: "Boleto",
  cash: "Dinheiro",
  transfer: "Transferência",
};

export function useContracts(statusFilter: "all" | ContractStatus = "all") {
  return useQuery({
    queryKey: ["contracts", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("contracts")
        .select("*, student:students(full_name), plan:plans(name, category, price_cents)")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Contract[];
    },
  });
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: ContractFormData) => {
      const { error } = await supabase.from("contracts").insert({
        student_id: data.student_id,
        plan_id: data.plan_id,
        start_date: data.start_date,
        end_date: data.end_date || null,
        status: data.status ?? "active",
        monthly_value_cents: data.monthly_value_cents ?? null,
        total_value_cents: data.total_value_cents ?? null,
        discount_cents: data.discount_cents ?? 0,
        payment_method: data.payment_method ?? null,
        payment_day: data.payment_day ?? null,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Contrato criado com sucesso!");
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
