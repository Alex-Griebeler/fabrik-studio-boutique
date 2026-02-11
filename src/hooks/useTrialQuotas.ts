import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export interface TrialQuota {
  date: string;
  trials_booked: number;
  max_trials: number;
  occupied_hours: string[];
}

export function useTrialQuota(date: string) {
  return useQuery({
    queryKey: ["trial_quotas", date],
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trial_quotas")
        .select("*")
        .eq("date", date)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as TrialQuota) ?? {
        date,
        trials_booked: 0,
        max_trials: 4,
        occupied_hours: [],
      };
    },
  });
}

export function useCheckTrialAvailability() {
  return {
    check: (quota: TrialQuota | null | undefined, time: string): { available: boolean; reason?: string } => {
      if (!quota) return { available: true };
      if (quota.trials_booked >= quota.max_trials) {
        return { available: false, reason: `Limite de ${quota.max_trials} trials/dia atingido` };
      }
      const hours = (quota.occupied_hours ?? []) as string[];
      if (hours.includes(time)) {
        return { available: false, reason: `Já existe um trial agendado neste horário (${time})` };
      }
      return { available: true };
    },
  };
}

export function useBookTrial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, date, time, trialType }: { leadId: string; date: string; time: string; trialType: string }) => {
      // Upsert quota
      const { data: existing } = await supabase
        .from("trial_quotas")
        .select("*")
        .eq("date", date)
        .maybeSingle();

      const typedExisting = existing as unknown as TrialQuota | null;
      if (typedExisting) {
        const hours = [...(typedExisting.occupied_hours ?? []), time];
        const { error } = await supabase
          .from("trial_quotas")
          .update({
            trials_booked: typedExisting.trials_booked + 1,
            occupied_hours: hours as Json,
          })
          .eq("date", date);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("trial_quotas")
          .insert([{
            date,
            trials_booked: 1,
            occupied_hours: [time] as Json,
          }]);
        if (error) throw error;
      }

      // Update lead
      const { error: leadErr } = await supabase
        .from("leads")
        .update({
          status: "trial_scheduled",
          trial_date: date,
          trial_time: time,
          trial_type: trialType,
        })
        .eq("id", leadId);
      if (leadErr) throw leadErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trial_quotas"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Trial agendado com sucesso!");
    },
    onError: () => toast.error("Erro ao agendar trial."),
  });
}
