import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];

export interface SessionWithTrainer extends SessionRow {
  trainers: { id: string; full_name: string } | null;
}

export interface ContractWithPlan extends ContractRow {
  plan: { name: string; frequency: string | null } | null;
}

/** Resolve the current logged-in user's student record via profiles → students.profile_id */
export function useCurrentStudent() {
  return useQuery({
    queryKey: ["current_student"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

      if (!profile) throw new Error("Perfil não encontrado");

      const { data: student, error } = await supabase
        .from("students")
        .select("*")
        .eq("profile_id", profile.id)
        .single();

      if (error || !student) throw new Error("Cadastro de aluno não encontrado");
      return student;
    },
  });
}

/** Get student's upcoming sessions (today and future) */
export function useStudentUpcomingSessions(studentId: string | undefined) {
  const today = format(new Date(), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["student_upcoming_sessions", studentId, today],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*, trainers:trainer_id(id, full_name)")
        .eq("student_id", studentId!)
        .gte("session_date", today)
        .in("status", ["scheduled", "completed"])
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(20);

      if (error) throw error;
      return data as unknown as SessionWithTrainer[];
    },
    refetchInterval: 30_000,
  });
}

/** Get student's session history (past completed sessions) */
export function useStudentSessionHistory(studentId: string | undefined) {
  const today = format(new Date(), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["student_session_history", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*, trainers:trainer_id(id, full_name)")
        .eq("student_id", studentId!)
        .eq("status", "completed")
        .lt("session_date", today)
        .order("session_date", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as unknown as SessionWithTrainer[];
    },
  });
}

/** Get student's makeup credits */
export function useStudentCredits(studentId: string | undefined) {
  return useQuery({
    queryKey: ["student_credits", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("makeup_credits")
        .select("*")
        .eq("student_id", studentId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

/** Get student's active contract with plan info */
export function useStudentActiveContract(studentId: string | undefined) {
  return useQuery({
    queryKey: ["student_active_contract", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, plan:plan_id(name, frequency)")
        .eq("student_id", studentId!)
        .eq("status", "active")
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return (data as unknown as ContractWithPlan) ?? null;
    },
  });
}

/** Student check-in mutation */
export function useStudentCheckin() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      sessionId: string;
      method: "manual" | "gps" | "photo";
      lat?: number;
      lng?: number;
    }) => {
      const update: Record<string, unknown> = {
        student_checkin_at: new Date().toISOString(),
        student_checkin_method: params.method,
      };
      if (params.lat != null) {
        update.student_checkin_lat = params.lat;
        update.student_checkin_lng = params.lng;
      }

      const { error } = await supabase
        .from("sessions")
        .update(update)
        .eq("id", params.sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student_upcoming_sessions"] });
      toast.success("Check-in realizado!");
    },
    onError: (err: Error) => {
      toast.error("Erro no check-in: " + err.message);
    },
  });
}

/** Available group sessions for booking */
export function useAvailableGroupSessions(studentId: string | undefined) {
  const today = format(new Date(), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["available_group_sessions", today],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*, trainers:trainer_id(id, full_name)")
        .eq("session_type", "group")
        .eq("status", "scheduled")
        .gte("session_date", today)
        .is("student_id", null)
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(30);

      if (error) throw error;
      return data as unknown as SessionWithTrainer[];
    },
  });
}
