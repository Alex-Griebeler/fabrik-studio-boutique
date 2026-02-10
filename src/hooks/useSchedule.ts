import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_templates"] });
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
      toast.success("Grade removida!");
    },
    onError: () => toast.error("Erro ao remover grade."),
  });
}

export function useGenerateWeekSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ weekStart }: { weekStart: string }) => {
      // 1. Fetch active templates
      const { data: templates, error: tErr } = await supabase
        .from("class_templates")
        .select("*")
        .eq("is_active", true);
      if (tErr) throw tErr;
      if (!templates?.length) throw new Error("Nenhum modelo ativo encontrado.");

      // 2. Compute dates for the week (weekStart is Sunday, day_of_week 0=Sun)
      const start = new Date(weekStart + "T00:00:00");
      const sessionsToInsert = templates.map((t) => {
        const date = new Date(start);
        date.setDate(date.getDate() + t.day_of_week);
        return {
          template_id: t.id,
          session_date: date.toISOString().split("T")[0],
          start_time: t.start_time,
          duration_minutes: t.duration_minutes,
          modality: t.modality,
          capacity: t.capacity,
          instructor_id: t.instructor_id || null,
        };
      });

      // 3. Check existing sessions for the week to avoid duplicates
      const weekEnd = new Date(start);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const { data: existing } = await supabase
        .from("class_sessions")
        .select("template_id, session_date")
        .gte("session_date", weekStart)
        .lte("session_date", weekEnd.toISOString().split("T")[0])
        .not("template_id", "is", null);

      const existingSet = new Set(
        (existing ?? []).map((e) => `${e.template_id}_${e.session_date}`)
      );

      const newSessions = sessionsToInsert.filter(
        (s) => !existingSet.has(`${s.template_id}_${s.session_date}`)
      );

      if (!newSessions.length) throw new Error("Todas as aulas desta semana já foram geradas.");

      const { error } = await supabase.from("class_sessions").insert(newSessions);
      if (error) throw error;
      return newSessions.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
      toast.success(`${count} aula(s) gerada(s) com sucesso!`);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Erro ao gerar aulas.");
    },
  });
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
      // Delete bookings first, then session
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

export function useDeleteWeekSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate: string; endDate: string }) => {
      // Get session IDs for the week
      const { data: sessions } = await supabase
        .from("class_sessions")
        .select("id")
        .gte("session_date", startDate)
        .lte("session_date", endDate);
      if (!sessions?.length) throw new Error("Nenhuma aula para excluir nesta semana.");
      const ids = sessions.map((s) => s.id);
      // Delete bookings then sessions
      await supabase.from("class_bookings").delete().in("session_id", ids);
      const { error } = await supabase.from("class_sessions").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["class_sessions"] });
      toast.success(`${count} aula(s) excluída(s)!`);
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao excluir aulas."),
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
