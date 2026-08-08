import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "./types";
import { useClassTemplates } from "./useTemplates";
import { useQueryClient } from "@tanstack/react-query";
import { sessionPaymentSnapshot } from "@/lib/sessionPayment";

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

      // Onda 2d: o template TEM instructor_id, mas o gerador criava a
      // sessão sem treinador e sem snapshot de pagamento — 18/18 sessões
      // de produção estavam assim e a folha somava R$ 0,00. Busca as
      // tarifas dos instrutores dos templates uma vez e carimba cada
      // sessão gerada (mesma matemática do SessionFormDialog).
      const instructorIds = [
        ...new Set(
          templates
            .map((t) => t.instructor_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const rateByTrainer = new Map<string, number>();
      if (instructorIds.length > 0) {
        const { data: trainerRates, error: ratesErr } = await supabase
          .from("trainers")
          .select("id, hourly_rate_main_cents")
          .in("id", instructorIds);
        if (ratesErr) {
          // Sem tarifa não se gera sessão sem valor de novo: aborta a
          // geração deste ciclo em vez de recriar o problema da folha.
          console.error("useAutoGenerateSessions: falha ao ler tarifas", ratesErr.message);
          return;
        }
        for (const t of trainerRates ?? []) {
          rateByTrainer.set(t.id, t.hourly_rate_main_cents);
        }
      }

      const sessionsToInsert: Array<{
        template_id: string;
        session_type: "group";
        session_date: string;
        start_time: string;
        end_time: string;
        duration_minutes: number;
        modality: string;
        capacity: number;
        trainer_id: string | null;
        trainer_hourly_rate_cents: number | null;
        payment_hours: number | null;
        payment_amount_cents: number | null;
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

              const snapshot = t.instructor_id
                ? sessionPaymentSnapshot(
                    t.duration_minutes,
                    rateByTrainer.get(t.instructor_id),
                  )
                : null;

              sessionsToInsert.push({
                template_id: t.id,
                session_type: "group",
                session_date: dateStr,
                start_time: t.start_time,
                end_time: endTime,
                duration_minutes: t.duration_minutes,
                modality: t.modality,
                capacity: t.capacity,
                trainer_id: t.instructor_id ?? null,
                trainer_hourly_rate_cents: snapshot?.trainer_hourly_rate_cents ?? null,
                payment_hours: snapshot?.payment_hours ?? null,
                payment_amount_cents: snapshot?.payment_amount_cents ?? null,
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
      // Onda 1.5a: colunas nomeadas em vez de `*` — as coordenadas GPS de
      // check-in (aluna e treinador) ficam fora do payload da agenda.
      const { data, error } = await supabase
        .from("sessions")
        .select(`
          id, session_date, start_time, end_time, duration_minutes,
          modality, session_type, status, capacity, notes, is_exception,
          is_makeup, is_paid, late_minutes, makeup_credit_id, contract_id,
          template_id, student_id, trainer_id, assistant_trainer_id,
          actual_start_time, student_checkin_at, student_checkin_method,
          trainer_checkin_at, trainer_checkin_method,
          cancellation_reason, cancellation_within_cutoff, cancelled_at,
          cancelled_by, dispute_reason, dispute_resolution, disputed_at,
          disputed_by, resolved_at, resolved_by, adjusted_at, adjusted_by,
          adjustment_reason, payment_amount_cents, payment_hours, paid_at,
          original_payment_amount_cents, trainer_hourly_rate_cents,
          assistant_hourly_rate_cents, assistant_payment_amount_cents,
          created_at, updated_at,
          trainer:trainers!sessions_trainer_id_fkey(id, full_name),
          assistant_trainer:trainers!sessions_assistant_trainer_id_fkey(id, full_name),
          student:students!sessions_student_id_fkey(id, full_name),
          bookings:class_bookings(*, student:students!class_bookings_student_id_fkey(id, full_name))
        `)
        .gte("session_date", startDate)
        .lte("session_date", endDate)
        .not("status", "in", "(cancelled_on_time,cancelled_late)")
        .order("session_date")
        .order("start_time")
        .limit(2000);
      if (error) throw error;
      return data as unknown as Session[];
    },
  });
}
