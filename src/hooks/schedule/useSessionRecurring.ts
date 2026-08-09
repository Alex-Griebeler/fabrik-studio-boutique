import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Session } from "./types";

export function useCancelSingleOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Paga não cancela (status contradiria a folha quitada). CAS no
      // UPDATE primeiro — 0 linhas = virou paga/já cancelada → erro sem
      // ter tocado nas reservas; bookings saem depois (retry converge:
      // o update repetido é idempotente).
      const { data: rows, error } = await supabase
        .from("sessions")
        .update({ status: "cancelled_on_time", is_exception: true, cancelled_at: new Date().toISOString() })
        .eq("id", id)
        .eq("is_paid", false)
        .select("id");
      if (error) throw error;
      if (!rows?.length) {
        throw new Error("Sessão paga não pode ser cancelada — recarregue.");
      }
      const { error: bookErr } = await supabase
        .from("class_bookings")
        .delete()
        .eq("session_id", id);
      if (bookErr) throw bookErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Ocorrência cancelada!");
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && e.message ? e.message : "Erro ao cancelar ocorrência.",
      ),
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

      // Truncar o template PRIMEIRO (erro checado): se falhar, nada foi
      // apagado; se o delete abaixo falhar, o retry converge (série já
      // encerrada não regenera). Paga fica (registro de folha): o DELETE
      // carrega o próprio filtro is_paid=false (CAS — pagamento no meio
      // não perde a sessão); bookings caem por CASCADE.
      const { error: endErr } = await supabase
        .from("class_templates")
        .update({ recurrence_end: newEnd })
        .eq("id", session.template_id);
      if (endErr) throw endErr;

      const { error: delErr } = await supabase
        .from("sessions")
        .delete()
        .eq("template_id", session.template_id)
        .gte("session_date", session.session_date)
        .eq("is_paid", false);
      if (delErr) throw delErr;
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
      // Não-pagas somem; PAGAS ficam (registro de folha). Se sobrou paga,
      // o template não pode ser deletado (FK) — é APOSENTADO (inativo +
      // série encerrada), o que também impede o gerador de recriar.
      const { data: sessions, error: selErr } = await supabase
        .from("sessions")
        .select("id, is_paid")
        .eq("template_id", templateId);
      if (selErr) throw selErr;

      const hasPaid = (sessions ?? []).some((s) => s.is_paid);

      // DELETE com o próprio filtro is_paid=false (CAS): pagamento entre o
      // SELECT e o DELETE não perde a sessão; bookings caem por CASCADE.
      const { error: delErr } = await supabase
        .from("sessions")
        .delete()
        .eq("template_id", templateId)
        .eq("is_paid", false);
      if (delErr) throw delErr;

      if (hasPaid) {
        const today = new Date().toISOString().split("T")[0];
        const { error: retireErr } = await supabase
          .from("class_templates")
          .update({ is_active: false, recurrence_end: today })
          .eq("id", templateId);
        if (retireErr) throw retireErr;
        return;
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

      // ORDEM pensada pra retry IDEMPOTENTE (não há transação client-side):
      // 1º apaga futuras não-pagas; 2º cria o template novo SE ainda não
      // existir (checagem por assinatura: dia+horário+início da série);
      // 3º trunca o antigo por ÚLTIMO. Qualquer falha → retry re-executa
      // no-ops e converge: sem série duplicada e sem "template morto"
      // (inserir antes de truncar preserva o recurrence_end ORIGINAL do
      // antigo pra copiar no novo).
      const { data: futureSessions, error: futErr } = await supabase
        .from("sessions")
        .select("id")
        .eq("template_id", session.template_id)
        .gte("session_date", session.session_date)
        .eq("is_exception", false)
        .eq("is_paid", false);
      if (futErr) throw futErr;

      if (futureSessions?.length) {
        const ids = futureSessions.map((s) => s.id);
        // CAS no próprio DELETE (pagamento entre SELECT e DELETE não perde
        // a sessão); bookings caem por CASCADE.
        const { error: delErr } = await supabase
          .from("sessions")
          .delete()
          .in("id", ids)
          .eq("is_paid", false);
        if (delErr) throw delErr;
      }

      // A assinatura da checagem usa TODOS os campos que seriam gravados:
      // só pula o insert se já existir um template IDÊNTICO (o órfão de um
      // retry — ou uma duplicata literal, que também não deve nascer).
      // Outra turma legítima no mesmo dia/horário difere em algo (modalidade,
      // instrutor, duração...) e NÃO colide. Residual documentado: duas abas
      // rodando a MESMA edição simultaneamente podem passar juntas na
      // checagem (sem UNIQUE no banco) — app de admin único, duplicata
      // visível em Turmas e removível; constraint dedicada é backlog.
      const newTpl = {
        // PR-E: service_type_id é NOT NULL — o template novo HERDA o
        // serviço da série (esquecê-lo estourava 23502 depois de já ter
        // apagado as futuras).
        service_type_id: oldTemplate.service_type_id,
        modality: updates.modality || oldTemplate.modality,
        day_of_week: oldTemplate.day_of_week,
        start_time: updates.start_time || oldTemplate.start_time,
        duration_minutes: updates.duration_minutes || oldTemplate.duration_minutes,
        capacity: updates.capacity || oldTemplate.capacity,
        instructor_id:
          updates.instructor_id !== undefined ? updates.instructor_id : oldTemplate.instructor_id,
        location: oldTemplate.location,
        is_active: true,
        recurrence_start: session.session_date,
        recurrence_end: oldTemplate.recurrence_end,
      };
      let existsQuery = supabase
        .from("class_templates")
        .select("id")
        .eq("day_of_week", newTpl.day_of_week)
        .eq("start_time", newTpl.start_time)
        .eq("recurrence_start", newTpl.recurrence_start)
        .eq("modality", newTpl.modality)
        .eq("duration_minutes", newTpl.duration_minutes)
        .eq("capacity", newTpl.capacity)
        .eq("service_type_id", newTpl.service_type_id)
        .eq("is_active", true);
      existsQuery =
        newTpl.instructor_id === null
          ? existsQuery.is("instructor_id", null)
          : existsQuery.eq("instructor_id", newTpl.instructor_id);
      existsQuery =
        newTpl.location === null
          ? existsQuery.is("location", null)
          : existsQuery.eq("location", newTpl.location);
      existsQuery =
        newTpl.recurrence_end === null
          ? existsQuery.is("recurrence_end", null)
          : existsQuery.eq("recurrence_end", newTpl.recurrence_end);
      const { data: existingNew, error: existsErr } = await existsQuery;
      if (existsErr) throw existsErr;

      if (!existingNew?.length) {
        const { error: newTplErr } = await supabase.from("class_templates").insert(newTpl);
        if (newTplErr) throw newTplErr;
      }

      const { error: endErr } = await supabase
        .from("class_templates")
        .update({ recurrence_end: oldEnd })
        .eq("id", session.template_id);
      if (endErr) throw endErr;
      // (Sessão PAGA nunca é deletada — o delete lá em cima filtra
      // is_paid=false; a paga antiga pode coexistir visível com a série
      // nova. Redesenho da recorrência é backlog registrado.)
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
      const { error: tplErr } = await supabase
        .from("class_templates")
        .update(updates)
        .eq("id", templateId);
      if (tplErr) throw tplErr;

      const sessionUpdates: Record<string, unknown> = { ...updates };
      if (updates.start_time && updates.duration_minutes) {
        const endMinutes =
          parseInt(updates.start_time.slice(0, 2)) * 60 +
          parseInt(updates.start_time.slice(3, 5)) +
          updates.duration_minutes;
        sessionUpdates.end_time = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
      }

      // Sessão PAGA fica fora de TUDO: pagou, congelou (horário antigo
      // visível > horário novo com dinheiro dessincronizado).
      const today = new Date().toISOString().split("T")[0];

      if (updates.duration_minutes) {
        // Duração mudou = dinheiro muda (base hourly). Estrutura E dinheiro
        // vão na MESMA escrita por sessão, com is_paid=false como
        // compare-and-swap por linha: sessão que virou paga entre o SELECT
        // e o UPDATE fica intacta por inteiro (0 linhas), nunca meio-a-meio.
        // A tarifa CONGELADA de cada sessão é respeitada; per_session
        // mantém o valor cravado (só horas informativas mudam). Cada passo
        // checa erro; o conjunto é idempotente (retry conserta parcial);
        // RPC transacional = backlog registrado.
        const newHours = updates.duration_minutes / 60;
        const { data: affected, error: selErr } = await supabase
          .from("sessions")
          .select("id, trainer_hourly_rate_cents, payment_rate_basis")
          .eq("template_id", templateId)
          .eq("is_exception", false)
          .eq("is_paid", false)
          .gte("session_date", today);
        if (selErr) throw selErr;
        const results = await Promise.all(
          (affected ?? []).map((row) => {
            const rowUpdate: Record<string, unknown> = {
              ...sessionUpdates,
              payment_hours: newHours,
            };
            // Base null = era antiga/hourly implícito: recalcula por hora.
            if (row.payment_rate_basis !== "per_session") {
              rowUpdate.payment_amount_cents = Math.round(
                newHours * (row.trainer_hourly_rate_cents || 0),
              );
            }
            return supabase
              .from("sessions")
              .update(rowUpdate)
              .eq("id", row.id)
              .eq("is_paid", false);
          }),
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      } else {
        // Sem mudança de duração não há dinheiro em jogo: lote estrutural.
        const { error: bulkErr } = await supabase
          .from("sessions")
          .update(sessionUpdates)
          .eq("template_id", templateId)
          .eq("is_exception", false)
          .eq("is_paid", false)
          .gte("session_date", today);
        if (bulkErr) throw bulkErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["class_templates"] });
      toast.success("Todos os eventos atualizados!");
    },
    onError: () => toast.error("Erro ao atualizar eventos."),
  });
}
