import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MonthlyKPI {
  competencia: string;
  total_leads: number;
  leads_marketing: number;
  leads_indicacao: number;
  leads_resgate: number;
  total_experimentais: number;
  total_conversoes: number;
  conversoes_indicacao: number;
  conversoes_marketing: number;
  taxa_conversao_leads: number;
  taxa_conversao_experimentais: number;
  planos_para_renovar: number;
  renovacoes_efetivas: number;
  taxa_renovacao: number;
  cancelamentos: number;
  taxa_churn: number;
  faturamento_cents: number;
  despesas_cents: number;
  resultado_cents: number;
  margem_lucro_pct: number;
  total_alunos: number;
  alunos_novos: number;
  alunos_perdidos: number;
  calculado_em: string;
}

export function useMonthlyKPIs(limit = 12) {
  return useQuery({
    queryKey: ["monthly_kpis", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_kpis")
        .select("*")
        .order("competencia", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as unknown as MonthlyKPI[];
    },
  });
}

export function useRecalculateKPIs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      const { error } = await supabase.rpc("calculate_monthly_kpis", { p_date: date });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monthly_kpis"] });
      toast.success("KPIs recalculados!");
    },
    onError: () => toast.error("Erro ao recalcular KPIs."),
  });
}
