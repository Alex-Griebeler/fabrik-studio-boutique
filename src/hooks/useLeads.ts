import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Student } from "@/hooks/useStudents";

export type InteractionType = "phone_call" | "whatsapp" | "email" | "visit" | "trial_class" | "follow_up" | "note";

export const interactionTypeLabels: Record<InteractionType, string> = {
  phone_call: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  visit: "Visita",
  trial_class: "Aula Experimental",
  follow_up: "Follow-up",
  note: "Anotação",
};

export const interactionTypeIcons: Record<InteractionType, string> = {
  phone_call: "📞",
  whatsapp: "💬",
  email: "📧",
  visit: "🏠",
  trial_class: "🏋️",
  follow_up: "🔄",
  note: "📝",
};

export interface Interaction {
  id: string;
  student_id: string;
  type: InteractionType;
  description: string;
  scheduled_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InteractionFormData {
  student_id: string;
  type: InteractionType;
  description: string;
  scheduled_at?: string;
  completed_at?: string;
}

export type LeadStage = "new" | "contacted" | "trial" | "negotiation" | "converted" | "lost";

export const leadStageLabels: Record<LeadStage, string> = {
  new: "Novo",
  contacted: "Contactado",
  trial: "Aula Experimental",
  negotiation: "Negociação",
  converted: "Convertido",
  lost: "Perdido",
};

export const leadStageColors: Record<LeadStage, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  contacted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  trial: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  negotiation: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  converted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  lost: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

// Leads = students with status 'lead'
export function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("status", "lead")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as (Student & { lead_stage: LeadStage })[];
    },
  });
}

export function useUpdateLeadStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: LeadStage }) => {
      const { error } = await supabase
        .from("students")
        .update({ lead_stage: stage } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useConvertLeadToStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("students")
        .update({ status: "active", is_active: true, lead_stage: "converted" } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success("Lead convertido em aluno com sucesso!");
    },
    onError: () => toast.error("Erro ao converter lead."),
  });
}

// Interactions
export function useInteractions(studentId: string) {
  return useQuery({
    queryKey: ["interactions", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interactions")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Interaction[];
    },
  });
}

export function useCreateInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: InteractionFormData) => {
      const { error } = await supabase.from("interactions").insert({
        student_id: data.student_id,
        type: data.type,
        description: data.description,
        scheduled_at: data.scheduled_at || null,
        completed_at: data.completed_at || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["interactions", vars.student_id] });
      toast.success("Interação registrada!");
    },
    onError: () => toast.error("Erro ao registrar interação."),
  });
}
