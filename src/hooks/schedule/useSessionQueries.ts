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
      const trainerByProfile = new Map<string, { id: string }>();
      const ambiguousProfiles = new Set<string>();
      // PR-C: a tarifa vem de trainer_service_rates (treinador × serviço
      // da turma), não mais do campo legado do cadastro.
      const rateByPair = new Map<string, { rate_cents: number; rate_basis: "hourly" | "per_session" }>();
      if (instructorProfileIds.length > 0) {
        const { data: trainerRows, error: trainersErr } = await supabase
          .from("trainers")
          .select("id, profile_id")
          .in("profile_id", instructorProfileIds);
        if (trainersErr) {
          console.error("useAutoGenerateSessions: falha ao ler treinadores", trainersErr.message);
          toast.error("Não foi possível ler os treinadores — geração adiada.");
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

        const trainerIds = [...trainerByProfile.values()].map((t) => t.id);
        if (trainerIds.length > 0) {
          const { data: rateRows, error: ratesErr } = await supabase
            .from("trainer_service_rates")
            .select("trainer_id, service_type_id, rate_basis, rate_cents")
            .in("trainer_id", trainerIds);
          if (ratesErr) {
            console.error("useAutoGenerateSessions: falha ao ler tarifas por serviço", ratesErr.message);
            toast.error("Não foi possível ler as tarifas por serviço — geração adiada.");
            return;
          }
          for (const r of rateRows ?? []) {
            rateByPair.set(`${r.trainer_id}|${r.service_type_id}`, {
              rate_cents: r.rate_cents,
              rate_basis: r.rate_basis as "hourly" | "per_session",
            });
          }
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
        // NÃO-nulos de propósito: depois da revisão fria, só template com
        // treinador, serviço e tarifa íntegros gera sessão — se alguém
        // reabrir um caminho nulo, o compilador acusa aqui.
        trainer_id: string;
        service_type_id: string;
        trainer_hourly_rate_cents: number;
        payment_hours: number;
        payment_amount_cents: number;
        payment_rate_basis: "hourly" | "per_session";
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
        // O serviço da turma vem do template (backfill da PR-A; o banco
        // preenche "grupo" em template novo). Sem ele não há como saber
        // qual tarifa usar.
        if (!t.service_type_id) {
          skippedReasons.add("turma sem serviço definido");
          console.error(`useAutoGenerateSessions: template ${t.id} sem service_type_id — pulado`);
          continue;
        }
        const rate = rateByPair.get(`${trainer.id}|${t.service_type_id}`);
        if (!rate) {
          skippedReasons.add(
            "treinador sem tarifa para o serviço da turma (cadastre em Treinadores → Pagamentos à equipe)",
          );
          console.error(
            `useAutoGenerateSessions: treinador ${trainer.id} sem tarifa no serviço ${t.service_type_id} — template pulado`,
          );
          continue;
        }

        const snapshot = sessionPaymentSnapshot(t.duration_minutes, rate);
        if (snapshot.payment_rate_basis === null) {
          // rate_cents<=0 não deveria existir (CHECK no banco) — se
          // aparecer, é pulo visível, nunca sessão de R$0.
          skippedReasons.add("tarifa inválida para o serviço da turma");
          continue;
        }
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
            service_type_id: t.service_type_id,
            trainer_hourly_rate_cents: snapshot.trainer_hourly_rate_cents,
            payment_hours: snapshot.payment_hours,
            payment_amount_cents: snapshot.payment_amount_cents,
            payment_rate_basis: snapshot.payment_rate_basis,
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
              // Retry POR LINHA: num lote, um único 23505 (terceira aba
              // criou outra data no meio) derruba TUDO e as demais linhas
              // sumiam da agenda em silêncio. Linha a linha, conflito é
              // benigno por linha e erro REAL vira aviso.
              const rowResults = await Promise.all(
                remaining.map((row) => supabase.from("sessions").insert(row)),
              );
              const realFailure = rowResults.find(
                (r) => r.error && r.error.code !== "23505",
              );
              if (realFailure?.error) {
                console.error("useAutoGenerateSessions: retry falhou", realFailure.error.message);
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
          service_type_id, payment_rate_basis,
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
