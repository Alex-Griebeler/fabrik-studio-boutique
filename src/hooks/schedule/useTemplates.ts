import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ClassTemplate } from "./types";

export function useClassTemplates() {
  return useQuery({
    queryKey: ["class_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_templates")
        .select("*, instructor:profiles!class_templates_instructor_id_fkey(id, full_name)")
        .eq("is_active", true)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return data as unknown as ClassTemplate[];
    },
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<ClassTemplate, "id" | "created_at" | "instructor">) => {
      const { error } = await supabase.from("class_templates").insert({
        modality: data.modality,
        day_of_week: data.day_of_week,
        start_time: data.start_time,
        duration_minutes: data.duration_minutes,
        capacity: data.capacity,
        instructor_id: data.instructor_id || null,
        location: data.location || null,
        is_active: data.is_active,
        recurrence_start: data.recurrence_start,
        recurrence_end: data.recurrence_end || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_templates"] });
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
      toast.success("Modelo de aula criado!");
    },
    onError: () => toast.error("Erro ao criar modelo."),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      modality?: string;
      day_of_week?: number;
      start_time?: string;
      duration_minutes?: number;
      capacity?: number;
      instructor_id?: string | null;
      location?: string | null;
      is_active?: boolean;
      recurrence_start?: string;
      recurrence_end?: string | null;
    }) => {
      const { error } = await supabase.from("class_templates").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_templates"] });
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
      toast.success("Grade atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar grade."),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("class_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_templates"] });
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
      toast.success("Grade removida!");
    },
    onError: () => toast.error("Erro ao remover grade."),
  });
}

export function useInstructors() {
  return useQuery({
    queryKey: ["instructors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });
}
