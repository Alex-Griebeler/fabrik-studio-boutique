import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Trainer } from "./schedule/types";

// Onda 1.5a: o SELECT amplo em trainers foi revogado no banco — o role
// `authenticated` só tem privilégio nas colunas operacionais abaixo.
// CPF, dados bancários, PIX e notes vivem atrás da view `trainers_admin`
// (gated por has_role ADMIN-only). `select("*")` aqui volta
// "permission denied".
// PR-E: os campos legados de tarifa (hourly_rate_*/session_rate/
// payment_method) foram APOSENTADOS — tarifa vive em trainer_service_rates.
const TRAINER_OPERATIONAL_COLUMNS =
  "id, full_name, email, phone, bio, certifications, specialties, " +
  "is_active, hired_at, terminated_at, profile_id, created_at, updated_at";

export function useTrainers(activeOnly = false) {
  return useQuery({
    queryKey: ["trainers", activeOnly],
    queryFn: async () => {
      let query = supabase
        .from("trainers")
        .select(TRAINER_OPERATIONAL_COLUMNS)
        .order("full_name")
        .limit(1000);
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Trainer[];
    },
  });
}

/**
 * Registro COMPLETO de um treinador (inclui cpf/banco/pix/notes) via a
 * view `trainers_admin` — retorna vazio para quem não é admin.
 * Uso exclusivo das telas administrativas (formulário de treinador).
 */
export function useTrainerAdmin(id: string | undefined) {
  return useQuery({
    queryKey: ["trainers_admin", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainers_admin")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Trainer) ?? null;
    },
  });
}

export function useTrainer(id: string | undefined) {
  return useQuery({
    queryKey: ["trainers", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainers")
        .select(TRAINER_OPERATIONAL_COLUMNS)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as Trainer;
    },
  });
}

export function useCreateTrainer() {
   const qc = useQueryClient();
   return useMutation({
     mutationFn: async (data: Partial<Trainer>) => {
       const { error } = await supabase.from("trainers").insert([data] as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trainers"] });
      toast.success("Treinador cadastrado!");
    },
    onError: () => toast.error("Erro ao cadastrar treinador."),
  });
}

export function useUpdateTrainer() {
   const qc = useQueryClient();
   return useMutation({
     mutationFn: async ({ id, ...data }: { id: string } & Partial<Trainer>) => {
       const { error } = await supabase.from("trainers").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trainers"] });
      // Sem isso, reabrir o form entrega o registro administrativo STALE
      // do cache e o save restauraria CPF/banco/PIX antigos.
      qc.invalidateQueries({ queryKey: ["trainers_admin"] });
      toast.success("Treinador atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar treinador."),
  });
}

export function useDeleteTrainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trainers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trainers"] });
      qc.invalidateQueries({ queryKey: ["trainers_admin"] });
      toast.success("Treinador removido!");
    },
    onError: () => toast.error("Erro ao remover. Verifique sessões vinculadas."),
  });
}

// Trainer session stats
export function useTrainerSessionStats(trainerId: string | undefined) {
  return useQuery({
    queryKey: ["trainer_session_stats", trainerId],
    enabled: !!trainerId,
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

      const { data: upcoming, error: e1 } = await supabase
        .from("sessions")
        .select("id")
        .eq("trainer_id", trainerId!)
        .gte("session_date", today)
        .eq("status", "scheduled")
        .limit(500);

      const { data: past, error: e2 } = await supabase
        .from("sessions")
        .select("id")
        .eq("trainer_id", trainerId!)
        .gte("session_date", weekAgo)
        .lt("session_date", today)
        .eq("status", "completed")
        .limit(500);

      if (e1) throw e1;
      if (e2) throw e2;

      return {
        upcomingCount: upcoming?.length ?? 0,
        pastWeekCount: past?.length ?? 0,
      };
    },
  });
}
