import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateLeadScore, type QualificationDetails } from "@/lib/leadScoring";

// ── Types ────────────────────────────────────────────────────

export type LeadStatus = "new" | "contacted" | "qualified" | "trial_scheduled" | "converted" | "lost";

export const leadStatusLabels: Record<LeadStatus, string> = {
  new: "Novo",
  contacted: "Contatado",
  qualified: "Qualificado",
  trial_scheduled: "Trial Agendado",
  converted: "Convertido",
  lost: "Perdido",
};

export const leadStatusColors: Record<LeadStatus, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  contacted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  qualified: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  trial_scheduled: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  converted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  lost: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export type InteractionType = "phone_call" | "whatsapp" | "email" | "visit" | "trial_class" | "follow_up" | "note";

export const interactionTypeLabels: Record<InteractionType, string> = {
  phone_call: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  visit: "Visita",
  trial_class: "Aula Experimental",
  follow_up: "Follow-up",
  note: "Anotação",
};

export const interactionTypeIcons: Record<InteractionType, string> = {
  phone_call: "📞",
  whatsapp: "💬",
  email: "📧",
  visit: "🏠",
  trial_class: "🏋️",
  follow_up: "🔄",
  note: "📝",
};

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  qualification_score: number;
  /**
   * Ficha de qualificação/anamnese (contém PAR-Q — dado de saúde).
   * Onda 1.5b: NÃO vem na listagem (useLeads); só no detalhe por lead
   * (useLeadDetail). Opcional de propósito.
   */
  qualification_details?: QualificationDetails;
  trial_date: string | null;
  trial_time: string | null;
  trial_type: string | null;
  converted_to_student_id: string | null;
  lost_reason: string | null;
  utm_params: Record<string, string> | null;
  tags: string[];
  referred_by: string | null;
  notes: string | null;
  temperature: string | null;
  consultant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadFormData {
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  notes?: string;
  tags?: string[];
  qualification_details?: QualificationDetails;
}

export interface Interaction {
  id: string;
  student_id: string | null;
  lead_id: string | null;
  type: InteractionType;
  description: string;
  scheduled_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InteractionFormData {
  lead_id?: string;
  student_id?: string;
  type: InteractionType;
  description: string;
  scheduled_at?: string;
  completed_at?: string;
}

// Keep old exports for backward compat during transition
export type LeadStage = LeadStatus;
export const leadStageLabels = leadStatusLabels;
export const leadStageColors = leadStatusColors;

// ── Filters ──────────────────────────────────────────────────

export interface LeadFilters {
  status?: LeadStatus | "all";
  source?: string;
  scoreMin?: number;
  scoreMax?: number;
  search?: string;
}

// ── Hooks ────────────────────────────────────────────────────

export function useLeads(filters?: LeadFilters) {
  return useQuery({
    queryKey: ["leads", filters],
    queryFn: async () => {
      // Onda 1.5b: a LISTAGEM não carrega qualification_details (ficha de
      // saúde/PAR-Q de até 1000 leads no bundle da recepção). A nota vem
      // de qualification_score (gradeFromScore); o detalhe completo é
      // por lead aberto, via useLeadDetail.
      let query = supabase
        .from("leads")
        .select(
          "id, name, email, phone, source, status, qualification_score, trial_date, trial_time, trial_type, converted_to_student_id, lost_reason, utm_params, tags, referred_by, temperature, consultant_id, notes, created_at, updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(1000);

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters?.source) {
        query = query.eq("source", filters.source);
      }
      if (filters?.scoreMin !== undefined) {
        query = query.gte("qualification_score", filters.scoreMin);
      }
      if (filters?.scoreMax !== undefined) {
        query = query.lte("qualification_score", filters.scoreMax);
      }
      if (filters?.search?.trim()) {
        query = query.ilike("name", `%${filters.search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Lead[];
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

/**
 * Lead COMPLETO (inclui qualification_details com o PAR-Q) — buscado
 * por lead aberto, nunca em lote. Uso: dialogs de detalhe.
 */
export function useLeadDetail(leadId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["lead_detail", leadId],
    enabled: !!leadId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Lead) ?? null;
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: LeadFormData) => {
      const details = data.qualification_details ?? {};
      const { score } = calculateLeadScore(details);

      const { error } = await supabase.from("leads").insert([{
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        source: data.source || null,
        notes: data.notes || null,
        tags: data.tags ?? [],
        qualification_details: details as never,
        qualification_score: score,
        temperature: null,
        consultant_id: null,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead cadastrado com sucesso!");
    },
    onError: () => toast.error("Erro ao cadastrar lead."),
  });
}

export function useUpdateLead() {
   const qc = useQueryClient();
   return useMutation({
     mutationFn: async ({ id, data }: { id: string; data: Partial<LeadFormData> & { lost_reason?: string } }) => {
       const updates: Record<string, string | number | QualificationDetails | string[] | null> = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.email !== undefined) updates.email = data.email || null;
      if (data.phone !== undefined) updates.phone = data.phone || null;
      if (data.source !== undefined) updates.source = data.source || null;
      if (data.notes !== undefined) updates.notes = data.notes || null;
      if (data.tags !== undefined) updates.tags = data.tags;
      if (data.lost_reason !== undefined) updates.lost_reason = data.lost_reason;
      if (data.qualification_details !== undefined) {
        updates.qualification_details = data.qualification_details;
        updates.qualification_score = calculateLeadScore(data.qualification_details).score;
      }

      const { error } = await supabase.from("leads").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar lead."),
  });
}

export function useUpdateLeadStatus() {
   const qc = useQueryClient();
   return useMutation({
     mutationFn: async ({ id, status, lost_reason }: { id: string; status: LeadStatus; lost_reason?: string }) => {
       const updates: Record<string, LeadStatus | string> = { status };
      if (lost_reason) updates.lost_reason = lost_reason;

      const { error } = await supabase.from("leads").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useIssueAnamneseLink() {
  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.rpc("issue_anamnese_link", {
        p_lead_id: leadId,
      });

      if (error) throw error;
      if (!data) throw new Error("Token de anamnese não retornado");

      return `${window.location.origin}/anamnese/${leadId}#token=${encodeURIComponent(data)}`;
    },
  });
}

// Keep old name for compat
export const useUpdateLeadStage = useUpdateLeadStatus;

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leadId: string) => {
      // 1. Fetch lead data
      const { data: lead, error: fetchErr } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();
      if (fetchErr || !lead) throw fetchErr || new Error("Lead não encontrado");

      // 2. Create student
      const { data: student, error: studentErr } = await supabase
        .from("students")
        .insert({
          full_name: lead.name,
          email: lead.email || null,
          phone: lead.phone || null,
          status: "active",
          is_active: true,
          lead_source: lead.source || null,
          notes: lead.notes || null,
        })
        .select("id")
        .single();
      if (studentErr || !student) throw studentErr || new Error("Erro ao criar aluno");

      // 3. Mark lead as converted
      const { error: updateErr } = await supabase
        .from("leads")
        .update({
          status: "converted",
          converted_to_student_id: student.id,
        })
        .eq("id", leadId);
      if (updateErr) throw updateErr;

      // 4. Auto-create commission for consultant if assigned
      // Note: Commission values start at 0. They should be populated when a contract is created
      // with actual values, or manually edited by admin/manager
      if (lead.consultant_id) {
        const today = new Date();
        const competencia = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
        await supabase.from("commissions").insert({
          profile_id: lead.consultant_id,
          lead_id: leadId,
          tipo: "venda_nova",
          competencia,
          valor_base_cents: 0,
          percentual_comissao: 0,
          valor_comissao_cents: 0,
          status: "calculada",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["commissions"] });
      toast.success("Lead convertido em aluno com sucesso!");
    },
    onError: () => toast.error("Erro ao converter lead."),
  });
}

// Keep old name for compat
export const useConvertLeadToStudent = useConvertLead;

// ── Interactions ─────────────────────────────────────────────

export function useInteractions(leadId: string) {
  return useQuery({
    queryKey: ["interactions", "lead", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interactions")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as Interaction[];
    },
    staleTime: 2 * 60 * 1000, // 2 min
  });
}

export function useCreateInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: InteractionFormData) => {
      const { error } = await supabase.from("interactions").insert({
        student_id: data.student_id || null,
        lead_id: data.lead_id || null,
        type: data.type,
        description: data.description,
        scheduled_at: data.scheduled_at || null,
        completed_at: data.completed_at || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      if (vars.lead_id) qc.invalidateQueries({ queryKey: ["interactions", "lead", vars.lead_id] });
      if (vars.student_id) qc.invalidateQueries({ queryKey: ["interactions", vars.student_id] });
      toast.success("Interação registrada!");
    },
    onError: () => toast.error("Erro ao registrar interação."),
  });
}
