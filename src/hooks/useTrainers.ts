import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Trainer } from "./schedule/types";

export function useTrainers(activeOnly = false) {
  return useQuery({
    queryKey: ["trainers", activeOnly],
    queryFn: async () => {
      let query = supabase
        .from("trainers")
        .select("*")
        .order("full_name");
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return data as Trainer[];
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
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Trainer;
    },
  });
}

export function useCreateTrainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Trainer>) => {
      const { error } = await supabase.from("trainers").insert(data as any);
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
      const { error } = await supabase.from("trainers").update(data as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trainers"] });
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
        .eq("status", "scheduled");

      const { data: past, error: e2 } = await supabase
        .from("sessions")
        .select("id")
        .eq("trainer_id", trainerId!)
        .gte("session_date", weekAgo)
        .lt("session_date", today)
        .eq("status", "completed");

      if (e1) throw e1;
      if (e2) throw e2;

      return {
        upcomingCount: upcoming?.length ?? 0,
        pastWeekCount: past?.length ?? 0,
      };
    },
  });
}
