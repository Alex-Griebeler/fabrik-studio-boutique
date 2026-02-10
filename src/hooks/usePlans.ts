import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type PlanCategory = Database["public"]["Enums"]["plan_category"];
type PlanDuration = Database["public"]["Enums"]["plan_duration"];

export interface Plan {
  id: string;
  name: string;
  category: PlanCategory;
  duration: PlanDuration;
  frequency: string | null;
  price_cents: number;
  description: string | null;
  is_active: boolean;
  validity_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface PlanFormData {
  name: string;
  category: PlanCategory;
  duration: PlanDuration;
  frequency?: string;
  price_cents: number;
  description?: string;
  is_active?: boolean;
  validity_days?: number | null;
}

export const categoryLabels: Record<PlanCategory, string> = {
  grupos_adultos: "Grupos Adultos",
  renovacao_grupos_adultos: "Renovação Grupos Adultos",
  plano_30_dias: "Plano 30 Dias",
  sessoes_avulsas_adultos: "Sessões Avulsas Adultos",
  planos_70_plus: "Planos 70+",
  planos_adolescentes: "Planos Adolescentes",
  sessoes_avulsas_adolescentes: "Sessões Avulsas Adolescentes",
  personal: "Personal",
  renovacao_personal: "Renovação Personal",
  alex_griebeler_individual: "Alex Griebeler Individual",
  alex_griebeler_small_group: "Alex Griebeler Small Group",
};

export const durationLabels: Record<PlanDuration, string> = {
  anual: "Anual",
  semestral: "Semestral",
  trimestral: "Trimestral",
  mensal: "Mensal",
  avulso: "Avulso",
  unico: "Único",
};

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export type CategoryFilter = "all" | PlanCategory;

export function usePlans(categoryFilter: CategoryFilter, activeOnly: boolean) {
  return useQuery({
    queryKey: ["plans", categoryFilter, activeOnly],
    queryFn: async () => {
      let query = supabase
        .from("plans")
        .select("*")
        .order("category")
        .order("name");

      if (categoryFilter !== "all") query = query.eq("category", categoryFilter);
      if (activeOnly) query = query.eq("is_active", true);

      const { data, error } = await query;
      if (error) throw error;
      return data as Plan[];
    },
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: PlanFormData) => {
      const { error } = await supabase.from("plans").insert({
        name: data.name,
        category: data.category,
        duration: data.duration,
        frequency: data.frequency || null,
        price_cents: data.price_cents,
        description: data.description || null,
        is_active: data.is_active ?? true,
        validity_days: data.validity_days ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plano cadastrado com sucesso!");
    },
    onError: () => toast.error("Erro ao cadastrar plano."),
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PlanFormData }) => {
      const { error } = await supabase.from("plans").update({
        name: data.name,
        category: data.category,
        duration: data.duration,
        frequency: data.frequency || null,
        price_cents: data.price_cents,
        description: data.description || null,
        is_active: data.is_active ?? true,
        validity_days: data.validity_days ?? null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plano atualizado com sucesso!");
    },
    onError: () => toast.error("Erro ao atualizar plano."),
  });
}
