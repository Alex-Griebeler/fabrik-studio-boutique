import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// A tabela `churn_alerts` ainda não está em
// `src/integrations/supabase/types.ts` (gerado pelo Lovable, não
// regeneramos manualmente). Cast controlado: o cliente tipado é usado
// em todo o resto da app; aqui pra essa tabela específica passamos
// sem tipo de tabela e reasseguramos cada `Row` como `ChurnAlert`
// (manual) no callsite.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type ChurnAlertStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "suppressed";

export type ChurnAlertMode = "shadow" | "live";

export type ChurnConfidence = "full" | "provisional";

export const churnStatusLabels: Record<ChurnAlertStatus, string> = {
  open: "Aberto",
  acknowledged: "Tratado",
  resolved: "Resolvido",
  suppressed: "Silenciado",
};

export const churnModeLabels: Record<ChurnAlertMode, string> = {
  shadow: "Shadow",
  live: "Live",
};

export const churnConfidenceLabels: Record<ChurnConfidence, string> = {
  full: "Full",
  provisional: "Provisional",
};

export interface ChurnAlertStudent {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

export interface ChurnAlertTrainer {
  id: string;
  full_name: string;
}

export interface ChurnAlert {
  id: string;
  student_id: string;
  trainer_id: string | null;
  confidence: ChurnConfidence;
  /** Média semanal de presenças na janela recente. */
  recent_weekly_avg: number;
  /** Média semanal de presenças na baseline (histórica). */
  baseline_weekly_avg: number;
  /** (baseline - recent) / baseline, fração 0-1. */
  drop_pct: number;
  recent_weeks_used: number;
  baseline_weeks_used: number;
  /** Threshold (0-1) aplicado no momento da detecção. */
  threshold_applied: number;
  /** ISO yyyy-mm-dd — range real de cobertura dos dados. */
  data_start: string;
  data_end: string;
  status: ChurnAlertStatus;
  mode: ChurnAlertMode;
  detected_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  student?: ChurnAlertStudent | null;
  trainer?: ChurnAlertTrainer | null;
}

const SELECT = `
  *,
  student:students!churn_alerts_student_id_fkey(id, full_name, email, phone),
  trainer:trainers!churn_alerts_trainer_id_fkey(id, full_name)
` as const;

export interface ChurnAlertFilters {
  status?: ChurnAlertStatus | "all";
  confidence?: ChurnConfidence | "all";
  mode?: ChurnAlertMode | "all";
  trainerId?: string | "all";
  studentId?: string;
}

export function useChurnAlerts(filters: ChurnAlertFilters = {}) {
  return useQuery({
    queryKey: ["churn_alerts", filters],
    queryFn: async () => {
      let query = sb
        .from("churn_alerts")
        .select(SELECT)
        .order("detected_at", { ascending: false });

      if (filters.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters.confidence && filters.confidence !== "all") {
        query = query.eq("confidence", filters.confidence);
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
      if (error) throw error as Error;
      return ((data ?? []) as unknown) as ChurnAlert[];
    },
  });
}

/**
 * Contador de churn_alerts em status `open` — usado pro badge no menu
 * lateral. `head: true` faz uma query só de count (rápida).
 */
export function useOpenChurnAlertsCount() {
  return useQuery({
    queryKey: ["churn_alerts", "open-count"],
    queryFn: async () => {
      const { count, error } = await sb
        .from("churn_alerts")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      if (error) throw error as Error;
      return (count as number | null) ?? 0;
    },
  });
}
