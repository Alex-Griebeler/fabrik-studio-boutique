import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "./types";
import { useClassTemplates } from "./useTemplates";
import { useQueryClient } from "@tanstack/react-query";
import { useUserRoles } from "@/hooks/useUserRoles";
import { sessionPaymentSnapshot } from "@/lib/sessionPayment";

// =========================================
// Auto-generate sessions from templates
// =========================================
export function useAutoGenerateSessions(startDate: string, endDate: string) {
  const qc = useQueryClient();
  const { data: templates } = useClassTemplates();
  const { hasAnyRole, loading: rolesLoading } = useUserRoles();

  // A policy de INSERT em sessions só aceita admin/instructor — antes,
  // a recepção abria a agenda, o gerador tentava inserir e falhava em
  // SILÊNCIO. Agora só quem PODE gerar tenta gerar (rodada Codex 2d).
  const canGenerate = !rolesLoading && hasAnyRole(["admin", "instructor"]);

  useEffect(() => {
    if (!templates?.length || !canGenerate) return;

    const generate = async () => {
      const { data: existing, error: existErr } = await supabase
        .from("sessions")
        .select("template_id, session_date")
        .gte("session_date", startDate)
        .lte("session_date", endDate)
        .not("template_id", "is", null);

      if (existErr) {
        console.error("useAutoGenerateSessions: falha ao ler agenda existente", existErr.message);
        toast.error("Não foi possível verificar a agenda existente — geração adiada.");
        return;
      }

      const existingSet = new Set(
        (existing ?? []).map((e) => `${e.template_id}_${e.session_date}`)
      );

      // Onda 2d: o template TEM instructor_id, mas o gerador criava a
      // sessão sem treinador e sem snapshot — 18/18 sessões de produção
      // assim, folha somando R$ 0,00.
      //
      // ⚠ CHAVES: class_templates.instructor_id referencia PROFILES.id;
      // sessions.trainer_id referencia TRAINERS.id. O elo é
      // trainers.profile_id (pego pela auditoria — usar profiles.id
      // direto violaria a FK e derrubaria o insert inteiro em silêncio).
      const instructorProfileIds = [
        ...new Set(
          templates
            .map((t) => t.instructor_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const trainerByProfile = new Map<
        string,
        { id: string; hourly_rate_main_cents: number }
      >();
      const ambiguousProfiles = new Set<string>();
      if (instructorProfileIds.length > 0) {
        const { data: trainerRows, error: ratesErr } = await supabase
          .from("trainers")
          .select("id, profile_id, hourly_rate_main_cents")
          .in("profile_id", instructorProfileIds);
        if (ratesErr) {
          console.error("useAutoGenerateSessions: falha ao ler tarifas", ratesErr.message);
          toast.error("Não foi possível ler as tarifas dos treinadores — geração adiada.");
          return;
        }
        for (const t of trainerRows ?? []) {
          if (!t.profile_id) continue;
          // trainers.profile_id NÃO tem UNIQUE: dois treinadores no mesmo
          // perfil deixariam o mapa (e a folha) não determinísticos.
          // Perfil ambíguo NÃO trava a agenda inteira: os templates que o
          // usam serão pulados com aviso, os demais geram normalmente.
          if (trainerByProfile.has(t.profile_id)) {
            console.error(
              `useAutoGenerateSessions: perfil ${t.profile_id} vinculado a mais de um treinador`,
            );
            ambiguousProfiles.add(t.profile_id);
            continue;
          }
          trainerByProfile.set(t.profile_id, t);
        }

      }
      // A validação de vínculo/tarifa acontece adiante, POR TEMPLATE QUE
      // REALMENTE PRODUZ SESSÃO no período (revisão fria: validar todos
      // os templates ativos deixava um template encerrado/irrelevante
      // travar a agenda da semana inteira).

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

      // Templates PULADOS por configuração incompleta (sem instrutor,
      // sem treinador vinculado, sem tarifa, perfil ambíguo): as outras
      // turmas geram normalmente e o problema vira aviso VISÍVEL — nem
      // silêncio (defeito original), nem agenda-refém (revisão fria).
      const skippedReasons = new Set<string>();

      for (const t of templates) {
        // 1º passo: quais datas este template produziria no período?
        const dates: string[] = [];
        const current = new Date(start);
        while (current <= end) {
          const dayOfWeek = current.getDay();
          const dateStr = current.toISOString().split("T")[0];
          if (dayOfWeek === t.day_of_week) {
            const inRecurrence =
              dateStr >= t.recurrence_start &&
              (t.recurrence_end === null || dateStr <= t.recurrence_end);
            if (inRecurrence && !existingSet.has(`${t.id}_${dateStr}`)) {
              dates.push(dateStr);
            }
          }
          current.setDate(current.getDate() + 1);
        }
        // Template que não produz nada no período não valida nada nem
        // bloqueia ninguém.
        if (dates.length === 0) continue;

        // 2º passo: só gera com treinador e tarifa íntegros.
        if (!t.instructor_id) {
          skippedReasons.add("turma sem instrutor definido");
          console.error(`useAutoGenerateSessions: template ${t.id} sem instructor_id — pulado`);
          continue;
        }
        if (ambiguousProfiles.has(t.instructor_id)) {
          skippedReasons.add("perfil vinculado a dois cadastros de treinador");
          continue;
        }
        const trainer = trainerByProfile.get(t.instructor_id);
        if (!trainer) {
          skippedReasons.add("instrutor sem cadastro de treinador vinculado");
          console.error(`useAutoGenerateSessions: template ${t.id} com instrutor sem treinador — pulado`);
          continue;
        }
        if (!trainer.hourly_rate_main_cents || trainer.hourly_rate_main_cents <= 0) {
          skippedReasons.add("treinador sem tarifa configurada");
          console.error(`useAutoGenerateSessions: treinador ${trainer.id} sem tarifa — template pulado`);
          continue;
        }

        const snapshot = sessionPaymentSnapshot(
          t.duration_minutes,
          trainer.hourly_rate_main_cents,
        );
        for (const dateStr of dates) {
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
            trainer_id: trainer.id,
            trainer_hourly_rate_cents: snapshot.trainer_hourly_rate_cents,
            payment_hours: snapshot.payment_hours,
            payment_amount_cents: snapshot.payment_amount_cents,
          });
        }
      }

      if (skippedReasons.size > 0) {
        toast.error(
          `Turmas fora da agenda: ${[...skippedReasons].join("; ")}. Corrija em Turmas/Treinadores.`,
        );
      }

      if (sessionsToInsert.length > 0) {
        const { error } = await supabase.from("sessions").insert(sessionsToInsert);
        if (error) {
          // 23505 = corrida com outra aba (o UNIQUE parcial segura a
          // duplicata). Num insert em LOTE o conflito derruba o lote
          // inteiro — inclusive linhas que não conflitavam. Retry único:
          // relê o que já existe e insere só o restante.
          if (error.code === "23505") {
            const { data: nowExisting, error: rereadErr } = await supabase
              .from("sessions")
              .select("template_id, session_date")
              .gte("session_date", startDate)
              .lte("session_date", endDate)
              .not("template_id", "is", null);
            if (rereadErr) {
              // Sem a releitura não dá para saber o que faltou — reinserir
              // o lote às cegas mascararia lacunas atrás de outro 23505.
              console.error("useAutoGenerateSessions: releitura pós-conflito falhou", rereadErr.message);
              toast.error("Não foi possível gerar a agenda do período. Recarregue e tente de novo.");
              return;
            }
            const nowSet = new Set(
              (nowExisting ?? []).map((e) => `${e.template_id}_${e.session_date}`),
            );
            const remaining = sessionsToInsert.filter(
              (s) => !nowSet.has(`${s.template_id}_${s.session_date}`),
            );
            if (remaining.length > 0) {
              const { error: retryErr } = await supabase.from("sessions").insert(remaining);
              if (retryErr && retryErr.code !== "23505") {
                console.error("useAutoGenerateSessions: retry falhou", retryErr.message);
                toast.error("Não foi possível gerar a agenda do período. Recarregue e tente de novo.");
                return;
              }
            }
            qc.invalidateQueries({ queryKey: ["sessions", startDate, endDate] });
            return;
          }
          console.error("useAutoGenerateSessions: insert falhou", error.message);
          toast.error("Não foi possível gerar a agenda do período. Recarregue e tente de novo.");
          return;
        }
        qc.invalidateQueries({ queryKey: ["sessions", startDate, endDate] });
      }
    };

    generate();
  }, [templates, startDate, endDate, qc, canGenerate]);
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
