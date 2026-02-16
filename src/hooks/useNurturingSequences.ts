import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  const [selectedSeqId, setSelectedSeqId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Query: Load all sequences
  const { data: sequences = [], isLoading } = useQuery({
    queryKey: ["nurturing_sequences"],
    queryFn: async () => {
      const { data, error } = await supabase.from("nurturing_sequences").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as NurturingSequence[]) || [];
    },
    staleTime: 5000,
  });

  // Auto-select first sequence (moved out of queryFn)
  useEffect(() => {
    if (sequences.length > 0 && !selectedSeqId) {
      setSelectedSeqId(sequences[0].id);
    }
  }, [sequences, selectedSeqId]);

  // Query: Load steps for selected sequence
  const { data: steps = [] } = useQuery({
    queryKey: ["sequence_steps", selectedSeqId],
    queryFn: async () => {
      if (!selectedSeqId) return [];
      const { data, error } = await supabase.from("sequence_steps").select("*").eq("sequence_id", selectedSeqId).order("step_number", { ascending: true });
      if (error) throw error;
      return (data as SequenceStep[]) || [];
    },
    enabled: !!selectedSeqId,
    staleTime: 5000,
  });

  // Query: Load executions for selected sequence
  const { data: executions = [] } = useQuery({
    queryKey: ["sequence_executions", selectedSeqId],
    queryFn: async () => {
      if (!selectedSeqId) return [];
      const { data, error } = await supabase.from("sequence_executions").select("*").eq("sequence_id", selectedSeqId).order("started_at", { ascending: false }).limit(20);
      if (error) throw error;
      return (data as SequenceExecution[]) || [];
    },
    enabled: !!selectedSeqId,
    staleTime: 5000,
  });

  // Mutation: Create sequence
  const { mutate: createSequence, isPending: isCreating } = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("nurturing_sequences").insert({ name: "Nova Sequência", is_active: true }).select();
      if (error) throw error;
      return data?.[0];
    },
    onSuccess: (newSeq) => {
      if (newSeq) {
        setSelectedSeqId(newSeq.id);
        queryClient.invalidateQueries({ queryKey: ["nurturing_sequences"] });
        toast({ title: "Sequência criada" });
      }
    },
    onError: () => {
      toast({ title: "Erro ao criar", variant: "destructive" });
    },
  });

  // Mutation: Save sequence
  const { mutate: saveSequence, isPending: isSaving } = useMutation({
    mutationFn: async (form: Partial<NurturingSequence>) => {
      if (!selectedSeqId) throw new Error("Nenhuma sequência selecionada");
      const { error } = await supabase.from("nurturing_sequences")
        .update({ name: form.name, description: form.description, trigger_status: form.trigger_status, is_active: form.is_active })
        .eq("id", selectedSeqId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nurturing_sequences"] });
      toast({ title: "Sequência salva" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    },
  });

  // Mutation: Delete sequence
  const { mutate: deleteSequence } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nurturing_sequences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, deletedId) => {
      if (selectedSeqId === deletedId) setSelectedSeqId(null);
      queryClient.invalidateQueries({ queryKey: ["nurturing_sequences"] });
      toast({ title: "Sequência deletada" });
    },
    onError: () => {
      toast({ title: "Erro ao deletar", variant: "destructive" });
    },
  });

  // Mutation: Add step
  const { mutate: addStep } = useMutation({
    mutationFn: async () => {
      if (!selectedSeqId) throw new Error("Nenhuma sequência selecionada");
      const nextNum = steps.length > 0 ? Math.max(...steps.map(s => s.step_number)) + 1 : 1;
      const { error } = await supabase.from("sequence_steps").insert({
        sequence_id: selectedSeqId, step_number: nextNum, delay_hours: 0, message_content: "", channel: "whatsapp",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequence_steps", selectedSeqId] });
    },
    onError: () => {
      toast({ title: "Erro ao adicionar passo", variant: "destructive" });
    },
  });

  // Mutation: Update step
  const { mutate: updateStep } = useMutation({
    mutationFn: async ({ stepId, updates }: { stepId: string; updates: Partial<SequenceStep> }) => {
      const { error } = await supabase.from("sequence_steps").update(updates).eq("id", stepId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequence_steps", selectedSeqId] });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar passo", variant: "destructive" });
    },
  });

  // Mutation: Delete step
  const { mutate: deleteStep } = useMutation({
    mutationFn: async (stepId: string) => {
      const { error } = await supabase.from("sequence_steps").delete().eq("id", stepId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequence_steps", selectedSeqId] });
      toast({ title: "Passo removido" });
    },
    onError: () => {
      toast({ title: "Erro ao deletar passo", variant: "destructive" });
    },
  });

  const selectedSequence = sequences.find(s => s.id === selectedSeqId) || null;

  return {
    sequences,
    selectedSeqId,
    setSelectedSeqId,
    selectedSequence,
    steps,
    executions,
    loading: isLoading || isCreating || isSaving,
    createSequence: () => createSequence(),
    saveSequence,
    deleteSequence,
    addStep: () => addStep(),
    updateStep: (stepId: string, updates: Partial<SequenceStep>) => updateStep({ stepId, updates }),
    deleteStep,
  };
}
