import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PayableSession {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  session_type: "personal" | "group";
  modality: string;
  status: string;
  trainer_id: string | null;
  trainer_name: string | null;
  assistant_trainer_id: string | null;
  assistant_trainer_name: string | null;
  trainer_hourly_rate_cents: number | null;
  assistant_hourly_rate_cents: number | null;
  payment_hours: number | null;
  payment_amount_cents: number | null;
  assistant_payment_amount_cents: number | null;
  is_paid: boolean | null;
  paid_at: string | null;
  student_id: string | null;
  student_name: string | null;
  contract_id: string | null;
}

export interface TrainerPayrollSummary {
  trainer_id: string;
  trainer_name: string;
  total_sessions: number;
  total_hours: number;
  total_amount_cents: number;
  paid_amount_cents: number;
  unpaid_amount_cents: number;
  paid_count: number;
  unpaid_count: number;
  sessions: PayableSession[];
}

export function usePayableSessions(filters: {
  startDate: string;
  endDate: string;
  trainerId?: string;
  onlyUnpaid?: boolean;
}) {
  return useQuery({
    queryKey: ["payable_sessions", filters],
    queryFn: async () => {
      let query = supabase
        .from("payable_sessions")
        .select("*")
        .gte("session_date", filters.startDate)
        .lte("session_date", filters.endDate)
        .in("status", ["completed", "cancelled_late", "no_show", "late_arrival"])
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(5000);

      if (filters.trainerId) {
        query = query.eq("trainer_id", filters.trainerId);
      }
      if (filters.onlyUnpaid) {
        query = query.eq("is_paid", false);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PayableSession[];
    },
  });
}

export function usePayrollSummary(filters: {
  startDate: string;
  endDate: string;
  trainerId?: string;
  onlyUnpaid?: boolean;
}) {
  const { data: sessions, ...rest } = usePayableSessions(filters);

  const summaries: TrainerPayrollSummary[] = [];

  if (sessions) {
    const map = new Map<string, TrainerPayrollSummary>();

    for (const s of sessions) {
      if (!s.trainer_id || !s.trainer_name) continue;

      if (!map.has(s.trainer_id)) {
        map.set(s.trainer_id, {
          trainer_id: s.trainer_id,
          trainer_name: s.trainer_name,
          total_sessions: 0,
          total_hours: 0,
          total_amount_cents: 0,
          paid_amount_cents: 0,
          unpaid_amount_cents: 0,
          paid_count: 0,
          unpaid_count: 0,
          sessions: [],
        });
      }

      const t = map.get(s.trainer_id)!;
      t.total_sessions++;
      t.total_hours += s.payment_hours ?? 0;
      const amt = s.payment_amount_cents ?? 0;
      t.total_amount_cents += amt;
      if (s.is_paid) {
        t.paid_amount_cents += amt;
        t.paid_count++;
      } else {
        t.unpaid_amount_cents += amt;
        t.unpaid_count++;
      }
      t.sessions.push(s);

      // Include assistant payments if present
      if (s.assistant_trainer_id && s.assistant_payment_amount_cents) {
        const assAmt = s.assistant_payment_amount_cents;
        if (!map.has(s.assistant_trainer_id)) {
          map.set(s.assistant_trainer_id, {
            trainer_id: s.assistant_trainer_id,
            trainer_name: s.assistant_trainer_name || "Assistente",
            total_sessions: 0,
            total_hours: 0,
            total_amount_cents: 0,
            paid_amount_cents: 0,
            unpaid_amount_cents: 0,
            paid_count: 0,
            unpaid_count: 0,
            sessions: [],
          });
        }
        const ass = map.get(s.assistant_trainer_id)!;
        ass.total_sessions++;
        ass.total_hours += s.payment_hours ?? 0;
        ass.total_amount_cents += assAmt;
        if (s.is_paid) {
          ass.paid_amount_cents += assAmt;
          ass.paid_count++;
        } else {
          ass.unpaid_amount_cents += assAmt;
          ass.unpaid_count++;
        }
        ass.sessions.push(s);
      }
    }

    summaries.push(...Array.from(map.values()).sort((a, b) => a.trainer_name.localeCompare(b.trainer_name)));
  }

  return { data: summaries, sessions, ...rest };
}

export function useMarkSessionsPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionIds: string[]) => {
      const { error } = await supabase
        .from("sessions")
        .update({ is_paid: true, paid_at: new Date().toISOString() })
        .in("id", sessionIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payable_sessions"] });
      toast.success("Sessões marcadas como pagas!");
    },
    onError: () => toast.error("Erro ao marcar sessões como pagas."),
  });
}
