import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Commission {
  id: string;
  profile_id: string;
  competencia: string;
  tipo: "venda_nova" | "renovacao" | "indicacao" | "meta";
  contract_id: string | null;
  lead_id: string | null;
  valor_base_cents: number;
  percentual_comissao: number;
  valor_comissao_cents: number;
  status: "calculada" | "aprovada" | "paga" | "cancelada";
  data_pagamento: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string };
}

export interface CommissionFormData {
  profile_id: string;
  competencia: string;
  tipo: Commission["tipo"];
  contract_id?: string;
  lead_id?: string;
  valor_base_cents: number;
  percentual_comissao: number;
  valor_comissao_cents: number;
  status?: Commission["status"];
  data_pagamento?: string;
}

export function useCommissions(filters?: { competencia?: string; profile_id?: string }) {
  return useQuery({
    queryKey: ["commissions", filters],
    queryFn: async () => {
      let query = supabase
        .from("commissions")
        .select("*, profiles(full_name)")
        .order("competencia", { ascending: false })
        .limit(1000);

      if (filters?.competencia) {
        query = query.eq("competencia", filters.competencia);
      }
      if (filters?.profile_id) {
        query = query.eq("profile_id", filters.profile_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Commission[];
    },
  });
}

export function useCreateCommission() {
   const qc = useQueryClient();
   return useMutation({
     mutationFn: async (data: CommissionFormData) => {
       const { error } = await supabase.from("commissions").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commissions"] });
      toast.success("Comissão registrada!");
    },
    onError: () => toast.error("Erro ao registrar comissão."),
  });
}

export function useUpdateCommissionStatus() {
   const qc = useQueryClient();
   return useMutation({
     mutationFn: async ({ id, status, data_pagamento }: { id: string; status: Commission["status"]; data_pagamento?: string }) => {
       const updates: Record<string, Commission["status"] | string> = { status };
      if (data_pagamento) updates.data_pagamento = data_pagamento;
      const { error } = await supabase.from("commissions").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commissions"] });
      toast.success("Status atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar comissão."),
  });
}

export function useCommissionSummary(competencia?: string) {
  return useQuery({
    queryKey: ["commissions", "summary", competencia],
    queryFn: async () => {
       let query = supabase.from("commissions").select("status, valor_comissao_cents").limit(1000);
      if (competencia) query = query.eq("competencia", competencia);
       const { data, error } = await query;
       if (error) throw error;

       const items = data as Array<{ valor_comissao_cents?: number; status: string }>;
       return {
         total: items.reduce((s, c) => s + (c.valor_comissao_cents ?? 0), 0),
        pago: items.filter(c => c.status === "paga").reduce((s, c) => s + (c.valor_comissao_cents ?? 0), 0),
        pendente: items.filter(c => c.status !== "paga" && c.status !== "cancelada").reduce((s, c) => s + (c.valor_comissao_cents ?? 0), 0),
        count: items.length,
      };
    },
  });
}
