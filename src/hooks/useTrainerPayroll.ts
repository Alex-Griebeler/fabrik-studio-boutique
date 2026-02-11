import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TrainerPayrollSession {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  session_type: "personal" | "group";
  modality: string;
  status: string;
  payment_hours: number | null;
  payment_amount_cents: number | null;
  is_paid: boolean | null;
  paid_at: string | null;
  student_name: string | null;
}

export function useCurrentTrainerId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["current_trainer_id", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Get profile_id for current user
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user!.id)
        .single();
      if (!profile) return null;

      // Get trainer_id linked to this profile
      const { data: trainer } = await supabase
        .from("trainers")
        .select("id, full_name")
        .eq("profile_id", profile.id)
        .single();

      return trainer ?? null;
    },
  });
}

export function useTrainerPayrollSessions(filters: {
  startDate: string;
  endDate: string;
  trainerId?: string;
}) {
  return useQuery({
    queryKey: ["trainer_payroll_sessions", filters],
    enabled: !!filters.trainerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payable_sessions")
        .select("*")
        .eq("trainer_id", filters.trainerId!)
        .gte("session_date", filters.startDate)
        .lte("session_date", filters.endDate)
        .in("status", ["completed", "cancelled_late", "no_show", "late_arrival"])
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) throw error;
      return data as TrainerPayrollSession[];
    },
  });
}

export function useTrainerPayrollStats(sessions: TrainerPayrollSession[] | undefined) {
  if (!sessions?.length) {
    return {
      totalSessions: 0,
      totalHours: 0,
      totalAmountCents: 0,
      paidAmountCents: 0,
      unpaidAmountCents: 0,
      avgRateCents: 0,
    };
  }

  const totalSessions = sessions.length;
  const totalHours = sessions.reduce((sum, s) => sum + (s.payment_hours ?? 0), 0);
  const totalAmountCents = sessions.reduce((sum, s) => sum + (s.payment_amount_cents ?? 0), 0);
  const paidAmountCents = sessions
    .filter((s) => s.is_paid)
    .reduce((sum, s) => sum + (s.payment_amount_cents ?? 0), 0);
  const unpaidAmountCents = totalAmountCents - paidAmountCents;
  const avgRateCents = totalHours > 0 ? Math.round(totalAmountCents / totalHours) : 0;

  return { totalSessions, totalHours, totalAmountCents, paidAmountCents, unpaidAmountCents, avgRateCents };
}
