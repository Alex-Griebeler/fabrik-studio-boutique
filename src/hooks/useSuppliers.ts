import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Supplier {
  id: string;
  name: string;
  legal_name: string | null;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  pix_key: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account: string | null;
  payment_terms: string | null;
  contact_name: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierFormData {
  name: string;
  legal_name?: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  pix_key?: string;
  bank_name?: string;
  bank_branch?: string;
  bank_account?: string;
  payment_terms?: string;
  contact_name?: string;
  notes?: string;
  is_active?: boolean;
}

export function useSuppliers(activeOnly = true) {
  return useQuery({
    queryKey: ["suppliers", activeOnly],
    queryFn: async () => {
      let query = supabase.from("suppliers").select("*").order("name");
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query.limit(500);
      if (error) throw error;
      return data as Supplier[];
    },
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: SupplierFormData) => {
      const { error } = await supabase.from("suppliers").insert({
        name: data.name,
        legal_name: data.legal_name || null,
        cnpj: data.cnpj || null,
        email: data.email || null,
        phone: data.phone || null,
        pix_key: data.pix_key || null,
        bank_name: data.bank_name || null,
        bank_branch: data.bank_branch || null,
        bank_account: data.bank_account || null,
        payment_terms: data.payment_terms || null,
        contact_name: data.contact_name || null,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Fornecedor criado com sucesso!");
    },
    onError: () => toast.error("Erro ao criar fornecedor."),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SupplierFormData> }) => {
      const { error } = await supabase.from("suppliers").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Fornecedor atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar fornecedor."),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Fornecedor excluído!");
    },
    onError: () => toast.error("Erro ao excluir fornecedor."),
  });
}
