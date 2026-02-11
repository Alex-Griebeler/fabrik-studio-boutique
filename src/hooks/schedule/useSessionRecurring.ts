import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Session } from "./types";

export function useCancelSingleOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("class_bookings").delete().eq("session_id", id);
      const { error } = await supabase
        .from("sessions")
        .update({ status: "cancelled_on_time", is_exception: true, cancelled_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Ocorrência cancelada!");
    },
    onError: () => toast.error("Erro ao cancelar ocorrência."),
  });
}

export function useDeleteThisAndFollowing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ session }: { session: Session }) => {
      if (!session.template_id) throw new Error("Sessão sem template");

      const sessionDate = new Date(session.session_date + "T00:00:00");
      sessionDate.setDate(sessionDate.getDate() - 1);
      const newEnd = sessionDate.toISOString().split("T")[0];

      await supabase
        .from("class_templates")
        .update({ recurrence_end: newEnd })
        .eq("id", session.template_id);

      const { data: sessions } = await supabase
        .from("sessions")
        .select("id")
        .eq("template_id", session.template_id)
        .gte("session_date", session.session_date);

      if (sessions?.length) {
        const ids = sessions.map((s) => s.id);
        await supabase.from("class_bookings").delete().in("session_id", ids);
        await supabase.from("sessions").delete().in("id", ids);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["class_templates"] });
      toast.success("Eventos seguintes removidos!");
    },
    onError: () => toast.error("Erro ao remover eventos."),
  });
}

export function useDeleteAllOccurrences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id")
        .eq("template_id", templateId);

      if (sessions?.length) {
        const ids = sessions.map((s) => s.id);
        await supabase.from("class_bookings").delete().in("session_id", ids);
        await supabase.from("sessions").delete().in("id", ids);
      }

      const { error } = await supabase.from("class_templates").delete().eq("id", templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["class_templates"] });
      toast.success("Evento recorrente removido!");
    },
    onError: () => toast.error("Erro ao remover evento recorrente."),
  });
}

export function useUpdateThisAndFollowing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ session, updates }: {
      session: Session;
      updates: {
        start_time?: string;
        duration_minutes?: number;
        modality?: string;
        capacity?: number;
        instructor_id?: string | null;
      };
    }) => {
      if (!session.template_id) throw new Error("Sessão sem template");

      const sessionDate = new Date(session.session_date + "T00:00:00");
      sessionDate.setDate(sessionDate.getDate() - 1);
      const oldEnd = sessionDate.toISOString().split("T")[0];

      const { data: oldTemplate } = await supabase
        .from("class_templates")
        .select("*")
        .eq("id", session.template_id)
        .single();
      if (!oldTemplate) throw new Error("Template não encontrado");

      await supabase
        .from("class_templates")
        .update({ recurrence_end: oldEnd })
        .eq("id", session.template_id);

      await supabase.from("class_templates").insert({
        modality: updates.modality || oldTemplate.modality,
        day_of_week: oldTemplate.day_of_week,
        start_time: updates.start_time || oldTemplate.start_time,
        duration_minutes: updates.duration_minutes || oldTemplate.duration_minutes,
        capacity: updates.capacity || oldTemplate.capacity,
        instructor_id: updates.instructor_id !== undefined ? updates.instructor_id : oldTemplate.instructor_id,
        location: oldTemplate.location,
        is_active: true,
        recurrence_start: session.session_date,
        recurrence_end: oldTemplate.recurrence_end,
      });

      const { data: futureSessions } = await supabase
        .from("sessions")
        .select("id")
        .eq("template_id", session.template_id)
        .gte("session_date", session.session_date)
        .eq("is_exception", false);

      if (futureSessions?.length) {
        const ids = futureSessions.map((s) => s.id);
        await supabase.from("class_bookings").delete().in("session_id", ids);
        await supabase.from("sessions").delete().in("id", ids);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["class_templates"] });
      toast.success("Eventos atualizados!");
    },
    onError: () => toast.error("Erro ao atualizar eventos."),
  });
}

export function useUpdateAllOccurrences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, updates }: {
      templateId: string;
      updates: {
        start_time?: string;
        duration_minutes?: number;
        modality?: string;
        capacity?: number;
        instructor_id?: string | null;
      };
    }) => {
      await supabase
        .from("class_templates")
        .update(updates)
        .eq("id", templateId);

      const sessionUpdates: Record<string, unknown> = { ...updates };
      if (updates.start_time && updates.duration_minutes) {
        const endMinutes =
          parseInt(updates.start_time.slice(0, 2)) * 60 +
          parseInt(updates.start_time.slice(3, 5)) +
          updates.duration_minutes;
        sessionUpdates.end_time = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
      }

      const today = new Date().toISOString().split("T")[0];
      await supabase
        .from("sessions")
        .update(sessionUpdates)
        .eq("template_id", templateId)
        .eq("is_exception", false)
        .gte("session_date", today);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["class_templates"] });
      toast.success("Todos os eventos atualizados!");
    },
    onError: () => toast.error("Erro ao atualizar eventos."),
  });
}
