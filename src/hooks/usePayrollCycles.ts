import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PayrollCycle {
  id: string;
  competencia: string;
  start_date: string;
  end_date: string;
  status: "open" | "closed" | "processing";
  created_at: string;
  created_by: string;
  closed_at: string | null;
  closed_by: string | null;
  updated_at: string;
}

export function usePayrollCycles() {
  return useQuery({
    queryKey: ["payroll_cycles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_cycles")
        .select("*")
        .order("competencia", { ascending: false });
      if (error) throw error;
      return data as PayrollCycle[];
    },
  });
}

export function usePayrollCycle(cycleId: string | undefined) {
  return useQuery({
    queryKey: ["payroll_cycles", cycleId],
    enabled: !!cycleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_cycles")
        .select("*")
        .eq("id", cycleId!)
        .single();
      if (error) throw error;
      return data as PayrollCycle;
    },
  });
}

export function useCreatePayrollCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<PayrollCycle, "id" | "created_at" | "updated_at" | "closed_at" | "closed_by">) => {
      const { error } = await supabase.from("payroll_cycles").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll_cycles"] });
      toast.success("Ciclo de folha criado!");
    },
    onError: () => toast.error("Erro ao criar ciclo de folha."),
  });
}

export function useUpdatePayrollCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: { id: string } & Partial<PayrollCycle>) => {
      const { error } = await supabase
        .from("payroll_cycles")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll_cycles"] });
      toast.success("Ciclo de folha atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar ciclo de folha."),
  });
}

export function useClosePayrollCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cycleId: string) => {
      const { error } = await supabase
        .from("payroll_cycles")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
        })
        .eq("id", cycleId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll_cycles"] });
      toast.success("Ciclo de folha fechado!");
    },
    onError: () => toast.error("Erro ao fechar ciclo de folha."),
  });
}
