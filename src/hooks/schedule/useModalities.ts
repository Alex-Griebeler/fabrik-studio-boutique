import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ClassModality } from "./types";

export function useModalities() {
  return useQuery({
    queryKey: ["class_modalities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_modalities")
        .select("*")
        .order("sort_order")
        .limit(100);
      if (error) throw error;
      return data as unknown as ClassModality[];
    },
  });
}

export function useActiveModalities() {
  const { data: all, ...rest } = useModalities();
  return { data: all?.filter((m) => m.is_active), ...rest };
}

export function useCreateModality() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; slug: string; color: string; sort_order?: number }) => {
      const { error } = await supabase.from("class_modalities").insert({
        name: data.name,
        slug: data.slug,
        color: data.color,
        sort_order: data.sort_order ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_modalities"] });
      toast.success("Modalidade criada!");
    },
    onError: (e: Error) => {
      if (e?.message?.includes("duplicate")) toast.error("Slug já existe.");
      else toast.error("Erro ao criar modalidade.");
    },
  });
}

export function useUpdateModality() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; slug?: string; color?: string; is_active?: boolean; sort_order?: number }) => {
      const { error } = await supabase.from("class_modalities").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_modalities"] });
      toast.success("Modalidade atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar modalidade."),
  });
}

export function useDeleteModality() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("class_modalities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_modalities"] });
      toast.success("Modalidade removida!");
    },
    onError: () => toast.error("Erro ao remover. Verifique se não há aulas vinculadas."),
  });
}
