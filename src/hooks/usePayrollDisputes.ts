import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PayrollDispute {
  id: string;
  session_id: string;
  trainer_id: string;
  dispute_reason: string;
  dispute_detail: string | null;
  status: "open" | "resolved" | "rejected";
  resolution: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface PayrollDisputeWithDetails extends PayrollDispute {
  trainer_name?: string;
  session_date?: string;
  session_time?: string;
  payment_amount_cents?: number;
}

export function usePayrollDisputes(filters?: {
  trainerId?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ["payroll_disputes", filters],
    queryFn: async () => {
      let query = supabase
        .from("payroll_disputes")
        .select(
          `*,
          sessions(session_date, start_time, payment_amount_cents),
          trainers(full_name)`
        )
        .order("created_at", { ascending: false });

      if (filters?.trainerId) {
        query = query.eq("trainer_id", filters.trainerId);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((dispute: any) => ({
        ...dispute,
        trainer_name: dispute.trainers?.full_name,
        session_date: dispute.sessions?.session_date,
        session_time: dispute.sessions?.start_time,
        payment_amount_cents: dispute.sessions?.payment_amount_cents,
      })) as PayrollDisputeWithDetails[];
    },
  });
}

export function useCreatePayrollDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      data: Omit<
        PayrollDispute,
        "id" | "created_at" | "updated_at" | "resolved_at" | "resolved_by" | "resolution"
      >
    ) => {
      const { error } = await supabase.from("payroll_disputes").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll_disputes"] });
      toast.success("Disputa registrada!");
    },
    onError: () => toast.error("Erro ao registrar disputa."),
  });
}

export function useResolvePayrollDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      disputeId,
      resolution,
      status,
    }: {
      disputeId: string;
      resolution: string;
      status: "resolved" | "rejected";
    }) => {
      const { error } = await supabase
        .from("payroll_disputes")
        .update({
          status,
          resolution,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", disputeId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll_disputes"] });
      toast.success("Disputa resolvida!");
    },
    onError: () => toast.error("Erro ao resolver disputa."),
  });
}
