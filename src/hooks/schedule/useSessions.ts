import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ClassSession, SessionStatus, BookingStatus } from "./types";
import { useClassTemplates } from "./useTemplates";

// --- Auto-generate sessions from templates (lazy, on view) ---
export function useAutoGenerateSessions(startDate: string, endDate: string) {
  const qc = useQueryClient();
  const { data: templates } = useClassTemplates();

  useEffect(() => {
    if (!templates?.length) return;

    const generate = async () => {
      const { data: existing } = await supabase
        .from("class_sessions")
        .select("template_id, session_date")
        .gte("session_date", startDate)
        .lte("session_date", endDate)
        .not("template_id", "is", null);

      const existingSet = new Set(
        (existing ?? []).map((e) => `${e.template_id}_${e.session_date}`)
      );

      const sessionsToInsert: Array<{
        template_id: string;
        session_date: string;
        start_time: string;
        duration_minutes: number;
        modality: string;
        capacity: number;
        instructor_id: string | null;
      }> = [];

      const start = new Date(startDate + "T00:00:00");
      const end = new Date(endDate + "T00:00:00");

      for (const t of templates) {
        const current = new Date(start);
        while (current <= end) {
          const dayOfWeek = current.getDay();
          const dateStr = current.toISOString().split("T")[0];

          if (dayOfWeek === t.day_of_week) {
            const inRecurrence =
              dateStr >= t.recurrence_start &&
              (t.recurrence_end === null || dateStr <= t.recurrence_end);

            if (inRecurrence && !existingSet.has(`${t.id}_${dateStr}`)) {
              sessionsToInsert.push({
                template_id: t.id,
                session_date: dateStr,
                start_time: t.start_time,
                duration_minutes: t.duration_minutes,
                modality: t.modality,
                capacity: t.capacity,
                instructor_id: t.instructor_id || null,
              });
            }
          }
          current.setDate(current.getDate() + 1);
        }
      }

      if (sessionsToInsert.length > 0) {
        const { error } = await supabase.from("class_sessions").insert(sessionsToInsert);
        if (!error) {
          qc.invalidateQueries({ queryKey: ["class_sessions", startDate, endDate] });
        }
      }
    };

    generate();
  }, [templates, startDate, endDate, qc]);
}

// --- CRUD Sessions ---
export function useClassSessions(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["class_sessions", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_sessions")
        .select(`
          *,
          instructor:profiles!class_sessions_instructor_id_fkey(id, full_name),
          bookings:class_bookings(*, student:students!class_bookings_student_id_fkey(id, full_name))
        `)
        .gte("session_date", startDate)
        .lte("session_date", endDate)
        .neq("status", "cancelled")
        .order("session_date")
        .order("start_time");
      if (error) throw error;
      return data as unknown as ClassSession[];
    },
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      template_id?: string | null;
      session_date: string;
      start_time: string;
      duration_minutes: number;
      modality: string;
      capacity: number;
      instructor_id?: string | null;
      notes?: string | null;
    }) => {
      const { error } = await supabase.from("class_sessions").insert({
        template_id: data.template_id || null,
        session_date: data.session_date,
        start_time: data.start_time,
        duration_minutes: data.duration_minutes,
        modality: data.modality,
        capacity: data.capacity,
        instructor_id: data.instructor_id || null,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
      toast.success("Aula criada!");
    },
    onError: () => toast.error("Erro ao criar aula."),
  });
}

export function useUpdateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      start_time?: string;
      duration_minutes?: number;
      modality?: string;
      capacity?: number;
      instructor_id?: string | null;
      notes?: string | null;
      session_date?: string;
      is_exception?: boolean;
    }) => {
      const { error } = await supabase.from("class_sessions").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
      toast.success("Aula atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar aula."),
  });
}

export function useUpdateSessionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SessionStatus }) => {
      const { error } = await supabase.from("class_sessions").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
    },
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("class_bookings").delete().eq("session_id", id);
      const { error } = await supabase.from("class_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
      toast.success("Aula excluída!");
    },
    onError: () => toast.error("Erro ao excluir aula."),
  });
}

// --- Recurring operations ---
export function useCancelSingleOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("class_bookings").delete().eq("session_id", id);
      const { error } = await supabase
        .from("class_sessions")
        .update({ status: "cancelled" as SessionStatus, is_exception: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
      toast.success("Ocorrência removida!");
    },
    onError: () => toast.error("Erro ao remover ocorrência."),
  });
}

export function useDeleteThisAndFollowing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ session }: { session: ClassSession }) => {
      if (!session.template_id) throw new Error("Sessão sem template");

      const sessionDate = new Date(session.session_date + "T00:00:00");
      sessionDate.setDate(sessionDate.getDate() - 1);
      const newEnd = sessionDate.toISOString().split("T")[0];

      const { error: tErr } = await supabase
        .from("class_templates")
        .update({ recurrence_end: newEnd })
        .eq("id", session.template_id);
      if (tErr) throw tErr;

      const { data: sessions } = await supabase
        .from("class_sessions")
        .select("id")
        .eq("template_id", session.template_id)
        .gte("session_date", session.session_date);

      if (sessions?.length) {
        const ids = sessions.map((s) => s.id);
        await supabase.from("class_bookings").delete().in("session_id", ids);
        await supabase.from("class_sessions").delete().in("id", ids);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
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
        .from("class_sessions")
        .select("id")
        .eq("template_id", templateId);

      if (sessions?.length) {
        const ids = sessions.map((s) => s.id);
        await supabase.from("class_bookings").delete().in("session_id", ids);
        await supabase.from("class_sessions").delete().in("id", ids);
      }

      const { error } = await supabase.from("class_templates").delete().eq("id", templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
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
      session: ClassSession;
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

      const { error: createErr } = await supabase.from("class_templates").insert({
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
      if (createErr) throw createErr;

      const { data: futureSessions } = await supabase
        .from("class_sessions")
        .select("id")
        .eq("template_id", session.template_id)
        .gte("session_date", session.session_date)
        .eq("is_exception", false);

      if (futureSessions?.length) {
        const ids = futureSessions.map((s) => s.id);
        await supabase.from("class_bookings").delete().in("session_id", ids);
        await supabase.from("class_sessions").delete().in("id", ids);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
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
      const { error: tErr } = await supabase
        .from("class_templates")
        .update(updates)
        .eq("id", templateId);
      if (tErr) throw tErr;

      const today = new Date().toISOString().split("T")[0];
      const { error: sErr } = await supabase
        .from("class_sessions")
        .update(updates)
        .eq("template_id", templateId)
        .eq("is_exception", false)
        .gte("session_date", today);
      if (sErr) throw sErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
      qc.invalidateQueries({ queryKey: ["class_templates"] });
      toast.success("Todos os eventos atualizados!");
    },
    onError: () => toast.error("Erro ao atualizar eventos."),
  });
}

// --- Bookings ---
export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ session_id, student_id, status }: { session_id: string; student_id: string; status?: BookingStatus }) => {
      const { error } = await supabase.from("class_bookings").insert({
        session_id,
        student_id,
        status: status || "confirmed",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
      toast.success("Aluno agendado!");
    },
    onError: (e: any) => {
      if (e?.message?.includes("duplicate")) {
        toast.error("Aluno já está agendado nesta aula.");
      } else {
        toast.error("Erro ao agendar aluno.");
      }
    },
  });
}

export function useUpdateBookingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookingStatus }) => {
      const update: any = { status };
      if (status === "cancelled") update.cancelled_at = new Date().toISOString();
      const { error } = await supabase.from("class_bookings").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
    },
  });
}
