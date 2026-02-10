import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type SessionStatus = "scheduled" | "cancelled" | "completed";
export type BookingStatus = "confirmed" | "cancelled" | "waitlist" | "no_show";

export interface ClassModality {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_active: boolean;
  sort_order: number;
}

export interface ClassTemplate {
  id: string;
  modality: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  instructor_id: string | null;
  location: string | null;
  is_active: boolean;
  recurrence_start: string;
  recurrence_end: string | null;
  created_at: string;
  instructor?: { id: string; full_name: string } | null;
}

export interface ClassSession {
  id: string;
  template_id: string | null;
  session_date: string;
  start_time: string;
  duration_minutes: number;
  modality: string;
  capacity: number;
  instructor_id: string | null;
  status: SessionStatus;
  notes: string | null;
  is_exception: boolean;
  created_at: string;
  instructor?: { id: string; full_name: string } | null;
  bookings?: ClassBooking[];
}

export interface ClassBooking {
  id: string;
  session_id: string;
  student_id: string;
  status: BookingStatus;
  booked_at: string;
  cancelled_at: string | null;
  student?: { id: string; full_name: string } | null;
}

// Color map for modality slugs → tailwind classes
const COLOR_MAP: Record<string, string> = {
  primary: "bg-primary/15 text-primary border-primary/30",
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
  info: "bg-info/15 text-info border-info/30",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  secondary: "bg-secondary/15 text-secondary border-secondary/30",
  accent: "bg-accent/30 text-accent-foreground border-accent/50",
  purple: "bg-purple-500/15 text-purple-600 border-purple-500/30",
  pink: "bg-pink-500/15 text-pink-600 border-pink-500/30",
  orange: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  teal: "bg-teal-500/15 text-teal-600 border-teal-500/30",
  indigo: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
  cyan: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30",
};

export function getModalityColor(color: string): string {
  return COLOR_MAP[color] || COLOR_MAP.primary;
}

// --- Modalities ---
export function useModalities() {
  return useQuery({
    queryKey: ["class_modalities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_modalities")
        .select("*")
        .order("sort_order");
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
    onError: (e: any) => {
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

// --- Templates ---
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

// --- Auto-generate sessions from templates ---
export function useAutoGenerateSessions(startDate: string, endDate: string) {
  const qc = useQueryClient();
  const { data: templates } = useClassTemplates();

  useEffect(() => {
    if (!templates?.length) return;

    const generate = async () => {
      // 1. Get existing sessions in the date range
      const { data: existing } = await supabase
        .from("class_sessions")
        .select("template_id, session_date")
        .gte("session_date", startDate)
        .lte("session_date", endDate)
        .not("template_id", "is", null);

      const existingSet = new Set(
        (existing ?? []).map((e) => `${e.template_id}_${e.session_date}`)
      );

      // 2. Calculate which sessions need to be created
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
        // Check each day in the range
        const current = new Date(start);
        while (current <= end) {
          const dayOfWeek = current.getDay();
          const dateStr = current.toISOString().split("T")[0];

          if (dayOfWeek === t.day_of_week) {
            // Check recurrence bounds
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

// --- Sessions ---
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

// Delete a single recurring occurrence (cancel it so it won't regenerate)
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

// Delete this and following: truncate template recurrence_end
export function useDeleteThisAndFollowing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ session }: { session: ClassSession }) => {
      if (!session.template_id) throw new Error("Sessão sem template");

      // Set template recurrence_end to the day before this session
      const sessionDate = new Date(session.session_date + "T00:00:00");
      sessionDate.setDate(sessionDate.getDate() - 1);
      const newEnd = sessionDate.toISOString().split("T")[0];

      const { error: tErr } = await supabase
        .from("class_templates")
        .update({ recurrence_end: newEnd })
        .eq("id", session.template_id);
      if (tErr) throw tErr;

      // Delete all sessions from this date forward for this template
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

// Delete all occurrences: delete template + all its sessions
export function useDeleteAllOccurrences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      // Delete all sessions for this template
      const { data: sessions } = await supabase
        .from("class_sessions")
        .select("id")
        .eq("template_id", templateId);

      if (sessions?.length) {
        const ids = sessions.map((s) => s.id);
        await supabase.from("class_bookings").delete().in("session_id", ids);
        await supabase.from("class_sessions").delete().in("id", ids);
      }

      // Delete template
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

// Update this and following: split template
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

      // Truncate old template
      const sessionDate = new Date(session.session_date + "T00:00:00");
      sessionDate.setDate(sessionDate.getDate() - 1);
      const oldEnd = sessionDate.toISOString().split("T")[0];

      // Get old template data
      const { data: oldTemplate } = await supabase
        .from("class_templates")
        .select("*")
        .eq("id", session.template_id)
        .single();
      if (!oldTemplate) throw new Error("Template não encontrado");

      // Update old template end date
      await supabase
        .from("class_templates")
        .update({ recurrence_end: oldEnd })
        .eq("id", session.template_id);

      // Create new template with updates
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

      // Delete future sessions (they'll be auto-regenerated with new settings)
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

// Update all occurrences of a template
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
      // Update template
      const { error: tErr } = await supabase
        .from("class_templates")
        .update(updates)
        .eq("id", templateId);
      if (tErr) throw tErr;

      // Update all non-exception future sessions
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
