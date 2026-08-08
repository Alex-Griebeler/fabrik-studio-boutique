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

/** Baseline que o usuário VIU quando começou a editar (null = célula vazia). */
export type RateBaseline = { cents: number; basis: RateBasis } | null;

export const pairKey = (trainerId: string, serviceId: string) =>
  `${trainerId}|${serviceId}`;

/**
 * Conflito de concorrência: o servidor não está mais como o usuário viu.
 * `keys` = pares "trainer|service" conflitados (ou o id, no delete).
 */
export class RateConflictError extends Error {
  keys: string[];
  constructor(keys: string[]) {
    super("tarifa alterada em outra sessão");
    this.name = "RateConflictError";
    this.keys = keys;
  }
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

export interface SaveRatesInput {
  rows: RateUpsertRow[];
  /** por pairKey; o que o usuário viu ao começar a editar cada célula. */
  baselines: Record<string, RateBaseline>;
}

/**
 * Salvamento ATÔMICO com checagem de concorrência NO SERVIDOR: relê os
 * pares imediatamente antes do upsert e aborta com RateConflictError se
 * algum não estiver mais como o usuário viu (cache local desatualizado,
 * outro admin, outra aba). Janela residual entre releitura e upsert é de
 * milissegundos, num app de admin único e com tabela auditada — risco
 * aceito e documentado. O upsert é um único statement: tudo ou nada.
 */
export function useSaveTrainerServiceRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rows, baselines }: SaveRatesInput) => {
      if (rows.length === 0) return;
      const trainerIds = [...new Set(rows.map((r) => r.trainer_id))];
      const { data: current, error: readError } = await supabase
        .from("trainer_service_rates")
        .select("trainer_id, service_type_id, rate_basis, rate_cents")
        .in("trainer_id", trainerIds);
      if (readError) throw readError;

      const serverByPair: Record<string, RateBaseline> = {};
      for (const r of (current ?? []) as TrainerServiceRate[]) {
        serverByPair[pairKey(r.trainer_id, r.service_type_id)] = {
          cents: r.rate_cents,
          basis: r.rate_basis,
        };
      }
      const conflicted = rows
        .map((r) => pairKey(r.trainer_id, r.service_type_id))
        .filter((key) => {
          const server = serverByPair[key] ?? null;
          const base = baselines[key] ?? null;
          return server?.cents !== base?.cents || server?.basis !== base?.basis;
        });
      if (conflicted.length > 0) throw new RateConflictError(conflicted);

      const { error } = await supabase
        .from("trainer_service_rates")
        .upsert(rows as never[], { onConflict: "trainer_id,service_type_id" });
      if (error) throw error;
    },
    onSuccess: async (_d, { rows }) => {
      // Aguardar o refetch: o settle do componente (limpar rascunho) só
      // roda com o cache já fresco — sem janela exibindo valor antigo.
      await qc.invalidateQueries({ queryKey: ["trainer_service_rates"] });
      toast.success(
        rows.length === 1 ? "Tarifa salva." : `${rows.length} tarifas salvas.`,
      );
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ["trainer_service_rates"] });
      if (e instanceof RateConflictError) {
        toast.error(
          "Tarifa alterada em outra sessão — o valor atual foi recarregado. Revise antes de salvar.",
        );
        return;
      }
      toast.error(
        `Erro ao salvar tarifas — nada foi gravado. (${e instanceof Error ? e.message : "erro desconhecido"})`,
      );
    },
  });
}

/**
 * Ação em lote "aplicar padrão da casa": ON CONFLICT DO NOTHING
 * (ignoreDuplicates) — SÓ preenche pares vazios, NUNCA sobrescreve
 * tarifa existente (por isso dispensa baseline: colisão = no-op).
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
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["trainer_service_rates"] });
      toast.success("Padrão aplicado nos pares vazios.");
    },
    onError: (e) =>
      toast.error(
        `Erro ao aplicar o padrão — nada foi gravado. (${e instanceof Error ? e.message : "erro desconhecido"})`,
      ),
  });
}

export interface DeleteRateInput {
  id: string;
  /** O que o usuário estava VENDO ao confirmar — compare-and-swap no banco. */
  expectedCents: number;
  expectedBasis: RateBasis;
}

/**
 * Remoção com compare-and-swap REAL: o DELETE só acontece se a tarifa
 * ainda for exatamente a que o usuário confirmou (um único statement —
 * sem janela). 0 linhas removidas = mudou por baixo → RateConflictError.
 */
export function useDeleteTrainerServiceRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, expectedCents, expectedBasis }: DeleteRateInput) => {
      const { data, error } = await supabase
        .from("trainer_service_rates")
        .delete()
        .eq("id", id)
        .eq("rate_cents", expectedCents)
        .eq("rate_basis", expectedBasis)
        .select("id");
      if (error) throw error;
      if ((data ?? []).length === 0) throw new RateConflictError([id]);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["trainer_service_rates"] });
      toast.success("Tarifa removida.");
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ["trainer_service_rates"] });
      if (e instanceof RateConflictError) {
        toast.error(
          "Esta tarifa mudou (ou já foi removida) em outra sessão — valor recarregado, revise.",
        );
        return;
      }
      toast.error(
        `Erro ao remover tarifa. (${e instanceof Error ? e.message : "erro desconhecido"})`,
      );
    },
  });
}
