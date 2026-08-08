import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Tarifas por serviço (Onda 2d-2, PR-B). Leitura: RLS admin+instructor.
// Escrita: RLS admin. O gerador de agenda SÓ passa a consumir estas
// tarifas na PR-C — até lá a folha usa a tarifa legada do cadastro.

export interface ServiceType {
  id: string;
  slug: string;
  name: string;
  delivery_type: "group" | "personal";
  is_active: boolean;
  sort_order: number;
}

export type RateBasis = "hourly" | "per_session";

export interface TrainerServiceRate {
  id: string;
  trainer_id: string;
  service_type_id: string;
  rate_basis: RateBasis;
  rate_cents: number;
}

export interface RateUpsertRow {
  trainer_id: string;
  service_type_id: string;
  rate_basis: RateBasis;
  rate_cents: number;
}

export function useServiceTypes(includeInactive = false) {
  return useQuery({
    queryKey: ["service_types", includeInactive],
    queryFn: async () => {
      let query = supabase
        .from("service_types")
        .select("id, slug, name, delivery_type, is_active, sort_order")
        .order("sort_order");
      if (!includeInactive) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ServiceType[];
    },
  });
}

export function useTrainerServiceRates() {
  return useQuery({
    queryKey: ["trainer_service_rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainer_service_rates")
        .select("id, trainer_id, service_type_id, rate_basis, rate_cents")
        .order("id")
        .limit(1000);
      if (error) throw error;
      // 10 treinadores × poucos serviços hoje; se um dia chegar perto do
      // teto, é erro visível — nunca truncamento mudo (lição da folha).
      if ((data ?? []).length >= 1000) {
        throw new Error("Tarifas demais para uma página (1000+) — paginar o hook.");
      }
      return (data ?? []) as TrainerServiceRate[];
    },
  });
}

/**
 * Salvamento ATÔMICO das células editadas: um único upsert em lote
 * (um statement no banco — ou entra tudo, ou nada entra). Nunca chamar
 * em loop célula a célula.
 */
export function useSaveTrainerServiceRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: RateUpsertRow[]) => {
      if (rows.length === 0) return;
      const { error } = await supabase
        .from("trainer_service_rates")
        .upsert(rows as never[], { onConflict: "trainer_id,service_type_id" });
      if (error) throw error;
    },
    onSuccess: (_d, rows) => {
      qc.invalidateQueries({ queryKey: ["trainer_service_rates"] });
      toast.success(
        rows.length === 1 ? "Tarifa salva." : `${rows.length} tarifas salvas.`,
      );
    },
    onError: () => toast.error("Erro ao salvar tarifas. Nada foi gravado."),
  });
}

/**
 * Ação em lote "aplicar padrão da casa": ON CONFLICT DO NOTHING
 * (ignoreDuplicates) — SÓ preenche pares vazios, NUNCA sobrescreve
 * tarifa existente. Sobrescrever é gesto manual, célula a célula.
 */
export function useApplyDefaultRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: RateUpsertRow[]) => {
      if (rows.length === 0) return;
      const { error } = await supabase
        .from("trainer_service_rates")
        .upsert(rows as never[], {
          onConflict: "trainer_id,service_type_id",
          ignoreDuplicates: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trainer_service_rates"] });
      toast.success("Padrão aplicado nos pares vazios.");
    },
    onError: () => toast.error("Erro ao aplicar o padrão. Nada foi gravado."),
  });
}

export function useDeleteTrainerServiceRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("trainer_service_rates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trainer_service_rates"] });
      toast.success("Tarifa removida.");
    },
    onError: () => toast.error("Erro ao remover tarifa."),
  });
}
