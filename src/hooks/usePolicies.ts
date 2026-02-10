import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Policy } from "./schedule/types";

export function usePolicies() {
  return useQuery({
    queryKey: ["policies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("policies")
        .select("*")
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
    return typeof policy.value === "string" ? JSON.parse(policy.value) : policy.value;
  } catch {
    return policy.value as T;
  }
}

export function useUpdatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const { error } = await (supabase as any)
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
