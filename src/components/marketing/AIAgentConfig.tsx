import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Save } from "lucide-react";

interface AIAgent {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  model: string;
  created_at: string;
}

const MODELS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (Rápido)" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Balanceado)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (Avançado)" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini (Rápido)" },
  { value: "openai/gpt-5", label: "GPT-5 (Avançado)" }
];

export function AIAgentConfig() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<AIAgent>>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadAgents();
  }, []);

  useEffect(() => {
    if (selectedAgentId) {
      const agent = agents.find(a => a.id === selectedAgentId);
      if (agent) {
        setEditForm(agent);
      }
    }
  }, [selectedAgentId]);

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from("ai_agent_config")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAgents(data || []);
      if (data && data.length > 0 && !selectedAgentId) {
        setSelectedAgentId(data[0].id);
      }
    } catch (error) {
      toast({
        title: "Erro ao carregar agentes",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  };

  const handleSaveAgent = async () => {
    if (!selectedAgentId || !editForm.name) {
      toast({
        title: "Erro",
        description: "Nome do agente é obrigatório",
        variant: "destructive"
      });
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
          is_active: editForm.is_active
        })
        .eq("id", selectedAgentId);

      if (error) throw error;
      
      loadAgents();
      toast({ title: "Agente atualizado com sucesso" });
    } catch (error) {
      toast({
        title: "Erro ao salvar agente",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAgent = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_agent_config")
        .insert({
          name: "Novo Agente",
          model: "google/gemini-3-flash-preview",
          temperature: 0.7,
          max_tokens: 2000,
          is_active: true
        })
        .select();

      if (error) throw error;
      if (data && data.length > 0) {
        setSelectedAgentId(data[0].id);
        loadAgents();
        toast({ title: "Agente criado com sucesso" });
      }
    } catch (error) {
      toast({
        title: "Erro ao criar agente",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    try {
      const { error } = await supabase
        .from("ai_agent_config")
        .delete()
        .eq("id", agentId);

      if (error) throw error;
      
      if (selectedAgentId === agentId) {
        setSelectedAgentId(null);
      }
      loadAgents();
      toast({ title: "Agente deletado com sucesso" });
    } catch (error) {
      toast({
        title: "Erro ao deletar agente",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Agents List */}
      <Card className="col-span-1">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Agentes</CardTitle>
              <CardDescription>Configuração de IA</CardDescription>
            </div>
            <Button size="sm" onClick={handleCreateAgent}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgentId(agent.id)}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                selectedAgentId === agent.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              <div className="font-medium text-sm">{agent.name}</div>
              <div className="text-xs opacity-70">{agent.model}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Agent Config Form */}
      <Card className="col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Configuração do Agente</CardTitle>
              <CardDescription>Customize o comportamento e modelos</CardDescription>
            </div>
            {selectedAgentId && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteAgent(selectedAgentId)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {selectedAgentId ? (
            <>
              <div className="space-y-2">
                <Label>Nome do Agente</Label>
                <Input
                  value={editForm.name || ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Ex: Agente de Vendas"
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={editForm.description || ""}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Descrição do agente"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Prompt do Sistema</Label>
                <Textarea
                  value={editForm.system_prompt || ""}
                  onChange={(e) => setEditForm({ ...editForm, system_prompt: e.target.value })}
                  placeholder="Instruções de sistema para o agente IA"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Modelo</Label>
                <Select value={editForm.model} onValueChange={(value) => setEditForm({ ...editForm, model: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Temperatura ({editForm.temperature?.toFixed(2)})</Label>
                  <Slider
                    value={[editForm.temperature || 0.7]}
                    onValueChange={(value) => setEditForm({ ...editForm, temperature: value[0] })}
                    min={0}
                    max={1}
                    step={0.1}
                  />
                  <p className="text-xs text-muted-foreground">Criatividade (0-1)</p>
                </div>

                <div className="space-y-2">
                  <Label>Máx Tokens ({editForm.max_tokens})</Label>
                  <Input
                    type="number"
                    value={editForm.max_tokens || 2000}
                    onChange={(e) => setEditForm({ ...editForm, max_tokens: parseInt(e.target.value) })}
                    min={100}
                    max={4000}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label>Ativo</Label>
                <Switch
                  checked={editForm.is_active || false}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked })}
                />
              </div>

              <Button onClick={handleSaveAgent} disabled={loading} className="w-full">
                <Save className="h-4 w-4 mr-2" />
                Salvar Configurações
              </Button>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <p>Selecione ou crie um agente</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
