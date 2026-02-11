import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "./types";
import { useClassTemplates } from "./useTemplates";
import { useQueryClient } from "@tanstack/react-query";

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
