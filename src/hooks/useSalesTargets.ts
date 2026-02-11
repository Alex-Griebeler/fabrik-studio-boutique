import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SalesTarget {
  id: string;
  profile_id: string;
  competencia: string;
  meta_leads: number;
  meta_experimentais: number;
  meta_conversoes: number;
  meta_faturamento_cents: number;
  realizado_leads: number;
  realizado_experimentais: number;
  realizado_conversoes: number;
  realizado_faturamento_cents: number;
  bonus_cents: number;
  meta_batida: boolean;
  profiles?: { full_name: string };
}

export interface SalesTargetFormData {
  profile_id: string;
  competencia: string;
  meta_leads: number;
  meta_experimentais: number;
  meta_conversoes: number;
  meta_faturamento_cents: number;
}

export function useSalesTargets(competencia?: string) {
  return useQuery({
    queryKey: ["sales_targets", competencia],
    queryFn: async () => {
      let query = supabase
        .from("sales_targets")
        .select("*, profiles(full_name)")
        .order("competencia", { ascending: false })
        .limit(1000);

      if (competencia) query = query.eq("competencia", competencia);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as SalesTarget[];
    },
  });
}

export function useUpsertSalesTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: SalesTargetFormData) => {
      const { error } = await supabase.from("sales_targets").upsert(data as any, {
        onConflict: "profile_id,competencia",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales_targets"] });
      toast.success("Meta salva!");
    },
    onError: () => toast.error("Erro ao salvar meta."),
  });
}
