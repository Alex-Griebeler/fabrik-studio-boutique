import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type AttendanceAlertStatus =
  | "pending"
  | "acknowledged"
  | "escalated"
  | "resolved"
  | "suppressed";

export type AttendanceAlertMode = "shadow" | "live";

export type AttendanceAlertType = "group_2_misses" | "pt_1_miss";

export const alertStatusLabels: Record<AttendanceAlertStatus, string> = {
  pending: "Pendente",
  acknowledged: "Tratado",
  escalated: "Escalado",
  resolved: "Resolvido",
  suppressed: "Silenciado",
};

export const alertTypeLabels: Record<AttendanceAlertType, string> = {
  group_2_misses: "2 faltas em grupo",
  pt_1_miss: "Falta em PT",
};

export const alertModeLabels: Record<AttendanceAlertMode, string> = {
  shadow: "Shadow",
  live: "Live",
};

export interface AttendanceAlert {
  id: string;
  student_id: string;
  trainer_id: string | null;
  escalated_to_trainer_id: string | null;
  alert_type: AttendanceAlertType;
  missed_session_ids: string[];
  missed_booking_ids: string[];
  missed_dates: string[];
  last_attended_at: string | null;
  plan_snapshot:
    | { plan_name: string; category?: string; frequency?: string | null }
    | null;
  status: AttendanceAlertStatus;
  mode: AttendanceAlertMode;
  suppress_reason: string | null;
  ack_token: string;
  message_sid: string | null;
  escalation_message_sid: string | null;
  message_to: string | null;
  detected_at: string;
  notified_at: string | null;
  acknowledged_at: string | null;
  acknowledged_via: string | null;
  escalated_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  student?: { id: string; full_name: string } | null;
  trainer?: { id: string; full_name: string } | null;
  escalated_to_trainer?: { id: string; full_name: string } | null;
}

const OPEN_STATUSES: AttendanceAlertStatus[] = ["pending", "escalated"];

const SELECT = `
  *,
  student:students!attendance_alerts_student_id_fkey(id, full_name),
  trainer:trainers!attendance_alerts_trainer_id_fkey(id, full_name),
  escalated_to_trainer:trainers!attendance_alerts_escalated_to_trainer_id_fkey(id, full_name)
` as const;

export interface AttendanceAlertFilters {
  status?: AttendanceAlertStatus | "open" | "all";
  mode?: AttendanceAlertMode | "all";
  trainerId?: string | "all";
  studentId?: string;
}

export function useAttendanceAlerts(filters: AttendanceAlertFilters = {}) {
  return useQuery({
    queryKey: ["attendance_alerts", filters],
    queryFn: async () => {
      let query = supabase.from("attendance_alerts")
        .select(SELECT)
        .order("detected_at", { ascending: true });

      if (filters.status === "open") {
        query = query.in("status", OPEN_STATUSES);
      } else if (filters.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters.mode && filters.mode !== "all") {
        query = query.eq("mode", filters.mode);
      }
      if (filters.trainerId && filters.trainerId !== "all") {
        query = query.eq("trainer_id", filters.trainerId);
      }
      if (filters.studentId) {
        query = query.eq("student_id", filters.studentId);
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as AttendanceAlert[];
    },
  });
}

export function useOpenAttendanceAlertForStudent(studentId: string | undefined) {
  return useQuery({
    queryKey: ["attendance_alerts", "open-by-student", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance_alerts")
        .select(SELECT)
        .eq("student_id", studentId!)
        .in("status", OPEN_STATUSES)
        .order("detected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AttendanceAlert | null;
    },
  });
}

export function useStudentAlertHistory(studentId: string | undefined) {
  return useQuery({
    queryKey: ["attendance_alerts", "history-by-student", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance_alerts")
        .select(SELECT)
        .eq("student_id", studentId!)
        .not("status", "in", `(${OPEN_STATUSES.join(",")})`)
        .order("detected_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as AttendanceAlert[];
    },
  });
}

export function useOpenAttendanceAlertsCount() {
  return useQuery({
    queryKey: ["attendance_alerts", "open-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("attendance_alerts")
        .select("id", { count: "exact", head: true })
        .in("status", OPEN_STATUSES);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useAcknowledgeAttendanceAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendance_alerts")
        .update({
          status: "acknowledged",
          acknowledged_at: new Date().toISOString(),
          acknowledged_via: "manual",
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance_alerts"] });
      toast.success("Alerta marcado como tratado.");
    },
    onError: (e: Error) => {
      toast.error(`Erro: ${e.message}`);
    },
  });
}

export function useResolveAttendanceAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendance_alerts")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance_alerts"] });
      toast.success("Alerta resolvido.");
    },
    onError: (e: Error) => {
      toast.error(`Erro: ${e.message}`);
    },
  });
}
