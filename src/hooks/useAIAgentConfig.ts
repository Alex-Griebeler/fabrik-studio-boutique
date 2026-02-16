import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import type { Json } from "@/integrations/supabase/types";

export interface AIAgent {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  model: string;
  knowledge_base: Record<string, Json | undefined>;
  handoff_rules: Json[];
  behavior_config: Record<string, Json | undefined>;
  created_at: string;
}

export interface AIUsageStats {
  total_messages: number;
  total_cost_cents: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

export function useAIAgentConfig() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<AIAgent>>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Query: Load all agents
  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ["ai_agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agent_config")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as AIAgent[]) || [];
    },
    staleTime: 5000,
  });

  // Auto-select first agent (moved out of queryFn)
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  // Query: Load usage stats (monthly)
  const { data: usageStats = { total_messages: 0, total_cost_cents: 0, total_input_tokens: 0, total_output_tokens: 0 } } = useQuery({
    queryKey: ["ai_usage_stats"],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("ai_conversation_logs")
        .select("input_tokens, output_tokens, cost_cents")
        .gte("created_at", startOfMonth.toISOString());

      if (error) throw error;
      const stats = (data || []).reduce((acc, log) => ({
        total_messages: acc.total_messages + 1,
        total_cost_cents: acc.total_cost_cents + (log.cost_cents || 0),
        total_input_tokens: acc.total_input_tokens + (log.input_tokens || 0),
        total_output_tokens: acc.total_output_tokens + (log.output_tokens || 0),
      }), { total_messages: 0, total_cost_cents: 0, total_input_tokens: 0, total_output_tokens: 0 });
      return stats;
    },
    staleTime: 60000,
  });

  // Update form when selected agent changes (moved to useEffect)
  const selectedAgent = agents.find(a => a.id === selectedAgentId) || null;

  useEffect(() => {
    if (selectedAgent && Object.keys(editForm).length === 0) {
      setEditForm(selectedAgent);
    }
  }, [selectedAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mutation: Save agent
  const { mutate: saveAgent, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      if (!selectedAgentId || !editForm.name) {
        throw new Error("Nome obrigatório");
      }
      const { error } = await supabase
        .from("ai_agent_config")
        .update({
          name: editForm.name,
          description: editForm.description,
          system_prompt: editForm.system_prompt,
          temperature: editForm.temperature,
          max_tokens: editForm.max_tokens,
          model: editForm.model,
          is_active: editForm.is_active,
          knowledge_base: (editForm.knowledge_base || {}) as Json,
          handoff_rules: (editForm.handoff_rules || []) as Json,
          behavior_config: (editForm.behavior_config || {}) as Json,
        })
        .eq("id", selectedAgentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai_agents"] });
      toast({ title: "Agente atualizado" });
    },
    onError: (error) => {
      toast({ title: "Erro ao salvar", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    },
  });

  // Mutation: Create agent
  const { mutate: createAgent, isPending: isCreating } = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("ai_agent_config")
        .insert({ name: "Novo Agente", model: "google/gemini-3-flash-preview", temperature: 0.7, max_tokens: 2000, is_active: true })
        .select();
      if (error) throw error;
      return data?.[0];
    },
    onSuccess: (newAgent) => {
      if (newAgent) {
        setSelectedAgentId(newAgent.id);
        queryClient.invalidateQueries({ queryKey: ["ai_agents"] });
        toast({ title: "Agente criado" });
      }
    },
    onError: (error) => {
      toast({ title: "Erro ao criar", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    },
  });

  // Mutation: Delete agent
  const { mutate: deleteAgent } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_agent_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, deletedId) => {
      if (selectedAgentId === deletedId) setSelectedAgentId(null);
      queryClient.invalidateQueries({ queryKey: ["ai_agents"] });
      toast({ title: "Agente deletado" });
    },
    onError: (error) => {
      toast({ title: "Erro ao deletar", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    },
  });

  return {
    agents,
    selectedAgentId,
    setSelectedAgentId,
    selectedAgent,
    editForm,
    setEditForm,
    usageStats,
    loading: agentsLoading || isSaving || isCreating,
    saveAgent: () => saveAgent(),
    createAgent: () => createAgent(),
    deleteAgent,
  };
}
