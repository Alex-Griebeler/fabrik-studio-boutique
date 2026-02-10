import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { MakeupCredit } from "./schedule/types";

export function useMakeupCredits(studentId?: string) {
  return useQuery({
    queryKey: ["makeup_credits", studentId],
    queryFn: async () => {
      let query = (supabase as any)
        .from("makeup_credits")
        .select("*, student:students!makeup_credits_student_id_fkey(id, full_name)")
        .order("created_at", { ascending: false });
      if (studentId) query = query.eq("student_id", studentId);
      const { data, error } = await query;
      if (error) throw error;
      return data as MakeupCredit[];
    },
  });
}

export function useAvailableCredits(studentId: string | undefined) {
  return useQuery({
    queryKey: ["makeup_credits", "available", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("makeup_credits")
        .select("*")
        .eq("student_id", studentId)
        .eq("status", "available");
      if (error) throw error;
      return data as MakeupCredit[];
    },
  });
}

export function useUseMakeupCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ creditId, sessionId }: { creditId: string; sessionId: string }) => {
      const { error } = await (supabase as any)
        .from("makeup_credits")
        .update({
          status: "used",
          used_session_id: sessionId,
          used_at: new Date().toISOString(),
        })
        .eq("id", creditId);
      if (error) throw error;

      // Mark session as makeup
      await (supabase as any)
        .from("sessions")
        .update({ is_makeup: true, makeup_credit_id: creditId })
        .eq("id", sessionId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["makeup_credits"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Crédito de reposição utilizado!");
    },
    onError: () => toast.error("Erro ao utilizar crédito."),
  });
}
