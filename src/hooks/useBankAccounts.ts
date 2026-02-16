import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BankAccount {
  id: string;
  name: string;
  bank_code: string | null;
  bank_name: string | null;
  branch: string | null;
  account_number: string | null;
  pix_key: string | null;
  is_active: boolean;
  current_balance_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankAccountFormData {
  name: string;
  bank_code?: string;
  bank_name?: string;
  branch?: string;
  account_number?: string;
  pix_key?: string;
  is_active?: boolean;
  current_balance_cents?: number;
  notes?: string;
}

export function useBankAccounts(activeOnly = true) {
  return useQuery({
    queryKey: ["bank-accounts", activeOnly],
    queryFn: async () => {
      let query = supabase.from("bank_accounts").select("*").order("name");
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data as BankAccount[];
    },
  });
}

export function useCreateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: BankAccountFormData) => {
      const { error } = await supabase.from("bank_accounts").insert({
        name: data.name,
        bank_code: data.bank_code || null,
        bank_name: data.bank_name || null,
        branch: data.branch || null,
        account_number: data.account_number || null,
        pix_key: data.pix_key || null,
        current_balance_cents: data.current_balance_cents ?? 0,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast.success("Conta bancária criada!");
    },
    onError: () => toast.error("Erro ao criar conta bancária."),
  });
}

export function useUpdateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BankAccountFormData> }) => {
      const { error } = await supabase.from("bank_accounts").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast.success("Conta bancária atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar conta bancária."),
  });
}

export function useDeleteBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast.success("Conta bancária excluída!");
    },
    onError: () => toast.error("Erro ao excluir conta bancária."),
  });
}
