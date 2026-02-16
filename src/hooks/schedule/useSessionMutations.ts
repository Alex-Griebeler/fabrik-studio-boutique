import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Session, FullSessionStatus } from "./types";

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

      if (withinCutoff && session.session_type === "personal" && session.student_id) {
        // Validate: check contract is active
        let contractActive = true;
        if (session.contract_id) {
          const { data: contract } = await supabase
            .from("contracts")
            .select("status")
            .eq("id", session.contract_id)
            .single();
          contractActive = contract?.status === "active";
        }

        // Validate: no duplicate credit for this session
        const { count: existingCredits } = await supabase
          .from("makeup_credits")
          .select("id", { count: "exact", head: true })
          .eq("original_session_id", session.id);

        if (contractActive && (existingCredits ?? 0) === 0) {
          await supabase.from("makeup_credits").insert({
            student_id: session.student_id,
            contract_id: session.contract_id,
            original_session_id: session.id,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
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
