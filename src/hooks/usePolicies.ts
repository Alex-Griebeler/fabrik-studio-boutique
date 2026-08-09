import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Policy } from "./schedule/types";

// Browser flows only need these non-routing business rules. Keeping the query
// explicit prevents sensitive attendance/agent configuration from being
// transferred even for an authorized admin session. RLS further limits
// non-admin operational roles to the two cancellation cutoffs they consume.
const SETTINGS_POLICY_KEYS = [
  "personal_cancellation_cutoff_hours",
  "group_cancellation_cutoff_hours",
  "late_arrival_tolerance_minutes",
  "auto_complete_after_minutes",
  "default_session_duration_minutes",
  "default_group_capacity",
  "makeup_credit_validity_days",
  "trainer_checkin_required",
  "student_checkin_required",
] as const;

export function usePolicies() {
  return useQuery({
    queryKey: ["policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("policies")
        .select("id,key,value,description,created_at,updated_at")
        .in("key", [...SETTINGS_POLICY_KEYS])
        .order("key");
      if (error) throw error;
      return data as Policy[];
    },
  });
}

export function usePolicy(key: string) {
  const { data: policies } = usePolicies();
  const policy = policies?.find((p) => p.key === key);
  return policy?.value;
}

export function usePolicyValue<T = number>(key: string, fallback: T): T {
  const { data: policies } = usePolicies();
  const policy = policies?.find((p) => p.key === key);
  if (!policy) return fallback;
  try {
    return (
      typeof policy.value === "string" ? JSON.parse(policy.value) : policy.value
    ) as T;
  } catch {
    return policy.value as T;
  }
}

export function useUpdatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: Policy["value"] }) => {
      const { error } = await supabase
        .from("policies")
        .update({ value: JSON.stringify(value) })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies"] });
      toast.success("Política atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar política."),
  });
}
