import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WaitlistEntry {
  id: string;
  lead_id: string;
  preferred_dates: string[] | null;
  preferred_times: string[] | null;
  session_type_preference: string;
  position: number;
  status: string;
  created_at: string;
}

export function useWaitlist() {
  return useQuery({
    queryKey: ["trial_waitlist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trial_waitlist")
        .select("*")
        .eq("status", "waiting")
        .order("position", { ascending: true });
      if (error) throw error;
      return data as unknown as WaitlistEntry[];
    },
  });
}

export function useAddToWaitlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: {
      lead_id: string;
      preferred_dates?: string[];
      preferred_times?: string[];
      session_type_preference?: string;
    }) => {
      // Get next position
      const { count } = await supabase
        .from("trial_waitlist")
        .select("*", { count: "exact", head: true })
        .eq("status", "waiting");

      const { error } = await supabase.from("trial_waitlist").insert({
        lead_id: entry.lead_id,
        preferred_dates: entry.preferred_dates ?? null,
        preferred_times: entry.preferred_times ?? null,
        session_type_preference: entry.session_type_preference ?? "any",
        position: (count ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trial_waitlist"] });
      toast.success("Adicionado à lista de espera!");
    },
    onError: () => toast.error("Erro ao adicionar à lista de espera."),
  });
}
