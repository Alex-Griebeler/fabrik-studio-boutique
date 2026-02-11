import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Session, FullSessionStatus, BookingStatus } from "./types";
import { useClassTemplates } from "./useTemplates";

// =========================================
// Auto-generate sessions from templates
// =========================================
export function useAutoGenerateSessions(startDate: string, endDate: string) {
  const qc = useQueryClient();
  const { data: templates } = useClassTemplates();

  useEffect(() => {
    if (!templates?.length) return;

    const generate = async () => {
      const { data: existing } = await supabase
        .from("sessions")
        .select("template_id, session_date")
        .gte("session_date", startDate)
        .lte("session_date", endDate)
        .not("template_id", "is", null);

      const existingSet = new Set(
        (existing ?? []).map((e) => `${e.template_id}_${e.session_date}`)
      );

      const sessionsToInsert: Array<{
        template_id: string;
        session_type: "group";
        session_date: string;
        start_time: string;
        end_time: string;
        duration_minutes: number;
        modality: string;
        capacity: number;
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
              const endMinutes =
                parseInt(t.start_time.slice(0, 2)) * 60 +
                parseInt(t.start_time.slice(3, 5)) +
                t.duration_minutes;
              const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

              sessionsToInsert.push({
                template_id: t.id,
                session_type: "group",
                session_date: dateStr,
                start_time: t.start_time,
                end_time: endTime,
                duration_minutes: t.duration_minutes,
                modality: t.modality,
                capacity: t.capacity,
              });
            }
          }
          current.setDate(current.getDate() + 1);
        }
      }

      if (sessionsToInsert.length > 0) {
        const { error } = await supabase.from("sessions").insert(sessionsToInsert);
        if (!error) {
          qc.invalidateQueries({ queryKey: ["sessions", startDate, endDate] });
        }
      }
    };

    generate();
  }, [templates, startDate, endDate, qc]);
}

// =========================================
// Query sessions
// =========================================
export function useClassSessions(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["sessions", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select(`
          *,
          trainer:trainers!sessions_trainer_id_fkey(id, full_name),
          assistant_trainer:trainers!sessions_assistant_trainer_id_fkey(id, full_name),
          student:students!sessions_student_id_fkey(id, full_name),
          bookings:class_bookings(*, student:students!class_bookings_student_id_fkey(id, full_name))
        `)
        .gte("session_date", startDate)
        .lte("session_date", endDate)
        .not("status", "in", "(cancelled_on_time,cancelled_late)")
        .order("session_date")
        .order("start_time");
      if (error) throw error;
      return data as unknown as Session[];
    },
  });
}

// =========================================
// Create session
// =========================================
export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      session_type?: string;
      template_id?: string | null;
      session_date: string;
      start_time: string;
      end_time?: string;
      duration_minutes: number;
      modality: string;
      capacity: number;
      trainer_id?: string | null;
      assistant_trainer_id?: string | null;
      student_id?: string | null;
      contract_id?: string | null;
      trainer_hourly_rate_cents?: number;
      payment_hours?: number;
      payment_amount_cents?: number;
      notes?: string | null;
    }) => {
      let endTime = data.end_time;
      if (!endTime) {
        const endMinutes =
          parseInt(data.start_time.slice(0, 2)) * 60 +
          parseInt(data.start_time.slice(3, 5)) +
          data.duration_minutes;
        endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
      }

      const { error } = await supabase.from("sessions").insert({
        session_type: (data.session_type || "group") as "group" | "personal",
        template_id: data.template_id || null,
        session_date: data.session_date,
        start_time: data.start_time,
        end_time: endTime,
        duration_minutes: data.duration_minutes,
        modality: data.modality,
        capacity: data.capacity,
        trainer_id: data.trainer_id || null,
        assistant_trainer_id: data.assistant_trainer_id || null,
        student_id: data.student_id || null,
        contract_id: data.contract_id || null,
        trainer_hourly_rate_cents: data.trainer_hourly_rate_cents || 0,
        payment_hours: data.payment_hours || 0,
        payment_amount_cents: data.payment_amount_cents || 0,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Sessão criada!");
    },
    onError: () => toast.error("Erro ao criar sessão."),
  });
}

// =========================================
// Update session
// =========================================
export function useUpdateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: unknown }) => {
      const { error } = await supabase.from("sessions").update(data as Record<string, unknown>).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Sessão atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar sessão."),
  });
}

// =========================================
// Update session status
// =========================================
export function useUpdateSessionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FullSessionStatus }) => {
      const update: Record<string, unknown> = { status };
      if (status === "cancelled_on_time" || status === "cancelled_late") {
        update.cancelled_at = new Date().toISOString();
      }
      const { error } = await supabase.from("sessions").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

// =========================================
// Cancel session (with cutoff logic)
// =========================================
export function useCancelSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      session,
      reason,
      cutoffHours,
    }: {
      session: Session;
      reason: string;
      cutoffHours: number;
    }) => {
      const sessionStart = new Date(`${session.session_date}T${session.start_time}`);
      const hoursUntil = (sessionStart.getTime() - Date.now()) / (1000 * 60 * 60);
      const withinCutoff = hoursUntil >= cutoffHours;
      const newStatus: FullSessionStatus = withinCutoff ? "cancelled_on_time" : "cancelled_late";

      const { error } = await supabase
        .from("sessions")
        .update({
          status: newStatus,
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
          cancellation_within_cutoff: withinCutoff,
        })
        .eq("id", session.id);
      if (error) throw error;

      // Create makeup credit if cancelled on time and it's personal
      if (withinCutoff && session.session_type === "personal" && session.student_id) {
        await supabase.from("makeup_credits").insert({
          student_id: session.student_id,
          contract_id: session.contract_id,
          original_session_id: session.id,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      return { status: newStatus, withinCutoff };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["makeup_credits"] });
      if (result.withinCutoff) {
        toast.success("Sessão cancelada no prazo. Crédito de reposição gerado.");
      } else {
        toast.warning("Sessão cancelada fora do prazo. Treinador será remunerado.");
      }
    },
    onError: () => toast.error("Erro ao cancelar sessão."),
  });
}

// =========================================
// Check-in
// =========================================
export function useTrainerCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("sessions")
        .update({
          trainer_checkin_at: new Date().toISOString(),
          trainer_checkin_method: "manual",
        })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Check-in do treinador registrado!");
    },
  });
}

export function useStudentCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("sessions")
        .update({
          student_checkin_at: new Date().toISOString(),
          student_checkin_method: "manual",
        })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Check-in do aluno registrado!");
    },
  });
}

// =========================================
// Complete session
// =========================================
export function useCompleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("sessions")
        .update({ status: "completed" })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Sessão concluída!");
    },
  });
}

// =========================================
// Delete session
// =========================================
export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("class_bookings").delete().eq("session_id", id);
      const { error } = await supabase.from("sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Sessão excluída!");
    },
    onError: () => toast.error("Erro ao excluir sessão."),
  });
}

// =========================================
// Recurring operations
// =========================================
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

// =========================================
// Bookings (group sessions)
// =========================================
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
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Aluno agendado!");
    },
    onError: (e: Error) => {
      if (e?.message?.includes("duplicate")) {
        toast.error("Aluno já está agendado nesta sessão.");
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
      const update: Record<string, unknown> = { status };
      if (status === "cancelled") update.cancelled_at = new Date().toISOString();
      const { error } = await supabase.from("class_bookings").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}
