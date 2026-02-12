import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export interface AIAgent {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  model: string;
  knowledge_base: Record<string, any>;
  handoff_rules: any[];
  behavior_config: Record<string, any>;
  created_at: string;
}

export interface AIUsageStats {
  total_messages: number;
  total_cost_cents: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

export function useAIAgentConfig() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<AIAgent>>({});
  const [usageStats, setUsageStats] = useState<AIUsageStats>({ total_messages: 0, total_cost_cents: 0, total_input_tokens: 0, total_output_tokens: 0 });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadAgents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("ai_agent_config")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAgents((data as AIAgent[]) || []);
      if (data && data.length > 0 && !selectedAgentId) setSelectedAgentId(data[0].id);
    } catch (error) {
      toast({ title: "Erro ao carregar agentes", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    }
  }, [toast, selectedAgentId]);

  const loadUsageStats = useCallback(async () => {
    try {
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
      setUsageStats(stats);
    } catch {
      // silently fail for stats
    }
  }, []);

  useEffect(() => { loadAgents(); loadUsageStats(); }, [loadAgents, loadUsageStats]);

  useEffect(() => {
    if (selectedAgentId) {
      const agent = agents.find(a => a.id === selectedAgentId);
      if (agent) setEditForm(agent);
    }
  }, [selectedAgentId, agents]);

  const saveAgent = useCallback(async () => {
    if (!selectedAgentId || !editForm.name) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
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
           knowledge_base: (editForm.knowledge_base || {}) as Record<string, any>,
           handoff_rules: (editForm.handoff_rules || []) as any[],
           behavior_config: (editForm.behavior_config || {}) as Record<string, any>,
         })
        .eq("id", selectedAgentId);
      if (error) throw error;
      loadAgents();
      toast({ title: "Agente atualizado" });
    } catch (error) {
      toast({ title: "Erro ao salvar", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [selectedAgentId, editForm, toast, loadAgents]);

  const createAgent = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_agent_config")
        .insert({ name: "Novo Agente", model: "google/gemini-3-flash-preview", temperature: 0.7, max_tokens: 2000, is_active: true })
        .select();
      if (error) throw error;
      if (data?.[0]) { setSelectedAgentId(data[0].id); loadAgents(); toast({ title: "Agente criado" }); }
    } catch (error) {
      toast({ title: "Erro ao criar", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, loadAgents]);

  const deleteAgent = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from("ai_agent_config").delete().eq("id", id);
      if (error) throw error;
      if (selectedAgentId === id) setSelectedAgentId(null);
      loadAgents();
      toast({ title: "Agente deletado" });
    } catch (error) {
      toast({ title: "Erro ao deletar", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    }
  }, [selectedAgentId, toast, loadAgents]);

  const selectedAgent = agents.find(a => a.id === selectedAgentId) || null;

  return {
    agents, selectedAgentId, setSelectedAgentId, selectedAgent,
    editForm, setEditForm, usageStats, loading,
    saveAgent, createAgent, deleteAgent,
  };
}
