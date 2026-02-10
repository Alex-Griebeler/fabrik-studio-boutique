import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ClassModality = "btb" | "hiit" | "personal" | "pilates" | "recovery";
export type SessionStatus = "scheduled" | "cancelled" | "completed";
export type BookingStatus = "confirmed" | "cancelled" | "waitlist" | "no_show";

export interface ClassTemplate {
  id: string;
  modality: ClassModality;
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
  modality: ClassModality;
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

export const MODALITY_LABELS: Record<ClassModality, string> = {
  btb: "BTB",
  hiit: "HIIT",
  personal: "Personal",
  pilates: "Pilates",
  recovery: "Recovery",
};

export const MODALITY_COLORS: Record<ClassModality, string> = {
  btb: "bg-primary/15 text-primary border-primary/30",
  hiit: "bg-destructive/15 text-destructive border-destructive/30",
  personal: "bg-info/15 text-info border-info/30",
  pilates: "bg-success/15 text-success border-success/30",
  recovery: "bg-warning/15 text-warning border-warning/30",
};

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
      modality: ClassModality;
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
