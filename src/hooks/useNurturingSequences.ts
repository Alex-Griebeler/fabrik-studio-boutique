import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export interface NurturingSequence {
  id: string;
  name: string;
  description: string | null;
  trigger_status: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  delay_hours: number;
  message_template_id: string | null;
  message_content: string | null;
  action_type: string | null;
  order_num: number | null;
  channel: string;
  condition: Record<string, any> | null;
}

export interface SequenceExecution {
  id: string;
  sequence_id: string;
  lead_id: string;
  current_step: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  next_step_at: string | null;
}

export function useNurturingSequences() {
  const [sequences, setSequences] = useState<NurturingSequence[]>([]);
  const [selectedSeqId, setSelectedSeqId] = useState<string | null>(null);
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [executions, setExecutions] = useState<SequenceExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadSequences = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("nurturing_sequences").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setSequences(data || []);
      if (data && data.length > 0 && !selectedSeqId) setSelectedSeqId(data[0].id);
    } catch (error) {
      toast({ title: "Erro ao carregar sequências", variant: "destructive" });
    }
  }, [toast, selectedSeqId]);

  const loadSteps = useCallback(async (seqId: string) => {
    try {
      const { data, error } = await supabase.from("sequence_steps").select("*").eq("sequence_id", seqId).order("step_number", { ascending: true });
      if (error) throw error;
      setSteps((data as any) || []);
    } catch { /* silent */ }
  }, []);

  const loadExecutions = useCallback(async (seqId: string) => {
    try {
      const { data, error } = await supabase.from("sequence_executions").select("*").eq("sequence_id", seqId).order("started_at", { ascending: false }).limit(20);
      if (error) throw error;
      setExecutions((data as any) || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadSequences(); }, [loadSequences]);

  useEffect(() => {
    if (selectedSeqId) { loadSteps(selectedSeqId); loadExecutions(selectedSeqId); }
    else { setSteps([]); setExecutions([]); }
  }, [selectedSeqId, loadSteps, loadExecutions]);

  const createSequence = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("nurturing_sequences").insert({ name: "Nova Sequência", is_active: true }).select();
      if (error) throw error;
      if (data?.[0]) { setSelectedSeqId(data[0].id); loadSequences(); toast({ title: "Sequência criada" }); }
    } catch (error) {
      toast({ title: "Erro ao criar", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast, loadSequences]);

  const saveSequence = useCallback(async (form: Partial<NurturingSequence>) => {
    if (!selectedSeqId) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("nurturing_sequences")
        .update({ name: form.name, description: form.description, trigger_status: form.trigger_status, is_active: form.is_active })
        .eq("id", selectedSeqId);
      if (error) throw error;
      loadSequences();
      toast({ title: "Sequência salva" });
    } catch (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally { setLoading(false); }
  }, [selectedSeqId, toast, loadSequences]);

  const deleteSequence = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from("nurturing_sequences").delete().eq("id", id);
      if (error) throw error;
      if (selectedSeqId === id) setSelectedSeqId(null);
      loadSequences();
      toast({ title: "Sequência deletada" });
    } catch (error) {
      toast({ title: "Erro ao deletar", variant: "destructive" });
    }
  }, [selectedSeqId, toast, loadSequences]);

  const addStep = useCallback(async () => {
    if (!selectedSeqId) return;
    const nextNum = steps.length > 0 ? Math.max(...steps.map(s => s.step_number)) + 1 : 1;
    try {
      const { error } = await supabase.from("sequence_steps").insert({
        sequence_id: selectedSeqId, step_number: nextNum, delay_hours: 0, message_content: "", channel: "whatsapp",
      });
      if (error) throw error;
      loadSteps(selectedSeqId);
    } catch (error) {
      toast({ title: "Erro ao adicionar passo", variant: "destructive" });
    }
  }, [selectedSeqId, steps, toast, loadSteps]);

  const updateStep = useCallback(async (stepId: string, updates: Partial<SequenceStep>) => {
    try {
      const { error } = await supabase.from("sequence_steps").update(updates as any).eq("id", stepId);
      if (error) throw error;
      if (selectedSeqId) loadSteps(selectedSeqId);
    } catch (error) {
      toast({ title: "Erro ao atualizar passo", variant: "destructive" });
    }
  }, [selectedSeqId, toast, loadSteps]);

  const deleteStep = useCallback(async (stepId: string) => {
    try {
      const { error } = await supabase.from("sequence_steps").delete().eq("id", stepId);
      if (error) throw error;
      if (selectedSeqId) loadSteps(selectedSeqId);
      toast({ title: "Passo removido" });
    } catch (error) {
      toast({ title: "Erro ao deletar passo", variant: "destructive" });
    }
  }, [selectedSeqId, toast, loadSteps]);

  const selectedSequence = sequences.find(s => s.id === selectedSeqId) || null;

  return {
    sequences, selectedSeqId, setSelectedSeqId, selectedSequence,
    steps, executions, loading,
    createSequence, saveSequence, deleteSequence,
    addStep, updateStep, deleteStep,
  };
}
