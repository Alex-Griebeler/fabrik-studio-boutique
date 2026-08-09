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
  service_type_id: string | null;
  payment_rate_basis: "hourly" | "per_session" | null;
  service_name: string | null;
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
      // `as unknown`: o types.ts gerado só ganha as colunas novas da view
      // quando a migration da PR-D aplicar em produção e o agente regenerar.
      return data as unknown as TrainerPayrollSession[];
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
      hasHourly: false,
    };
  }

  const totalSessions = sessions.length;
  const totalHours = sessions.reduce((sum, s) => sum + (s.payment_hours ?? 0), 0);
  const totalAmountCents = sessions.reduce((sum, s) => sum + (s.payment_amount_cents ?? 0), 0);
  const paidAmountCents = sessions
    .filter((s) => s.is_paid)
    .reduce((sum, s) => sum + (s.payment_amount_cents ?? 0), 0);
  const unpaidAmountCents = totalAmountCents - paidAmountCents;

  // Taxa média/hora SÓ faz sentido nas sessões pagas POR HORA — dividir
  // valor cravado (per_session) por horas inventa uma taxa que não existe
  // (fisio de 30min a R$108/sessão viraria "R$216/h"). Base null = era
  // legada = hourly implícito.
  const hourlyRows = sessions.filter((s) => s.payment_rate_basis !== "per_session");
  const hourlyHours = hourlyRows.reduce((sum, s) => sum + (s.payment_hours ?? 0), 0);
  const hourlyAmountCents = hourlyRows.reduce((sum, s) => sum + (s.payment_amount_cents ?? 0), 0);
  const avgRateCents = hourlyHours > 0 ? Math.round(hourlyAmountCents / hourlyHours) : 0;

  return {
    totalSessions,
    totalHours,
    totalAmountCents,
    paidAmountCents,
    unpaidAmountCents,
    avgRateCents,
    hasHourly: hourlyHours > 0,
  };
}
