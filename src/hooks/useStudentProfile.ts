import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Student } from "./useStudents";
import type { Contract } from "./useContracts";
import type { Invoice } from "./useInvoices";

export function useStudentById(id: string | undefined) {
  return useQuery({
    queryKey: ["student", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as Student;
    },
  });
}

export function useStudentContracts(studentId: string | undefined) {
  return useQuery({
    queryKey: ["student-contracts", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, plan:plans(name, category, price_cents)")
        .eq("student_id", studentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Contract[];
    },
  });
}

export function useStudentInvoices(studentId: string | undefined) {
  return useQuery({
    queryKey: ["student-invoices", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("student_id", studentId!)
        .order("due_date", { ascending: false });
      if (error) throw error;
      return data as unknown as Invoice[];
    },
  });
}

export function useStudentBookings(studentId: string | undefined) {
  return useQuery({
    queryKey: ["student-bookings", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_bookings")
        .select("*, session:class_sessions(session_date, start_time, duration_minutes, modality, instructor:profiles(full_name))")
        .eq("student_id", studentId!)
        .order("booked_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}
