import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Save, Brain, BookOpen, Settings2, Shield, BarChart3 } from "lucide-react";
import { useAIAgentConfig } from "@/hooks/useAIAgentConfig";
import { KPICard } from "@/components/shared/KPICard";

const MODELS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (Rápido)" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Balanceado)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (Avançado)" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini (Rápido)" },
  { value: "openai/gpt-5", label: "GPT-5 (Avançado)" },
];

export function AIAgentConfig() {
  const {
    agents, selectedAgentId, setSelectedAgentId,
    editForm, setEditForm, usageStats, loading,
    saveAgent, createAgent, deleteAgent,
  } = useAIAgentConfig();

  const kb = (editForm.knowledge_base || {}) as Record<string, string>;
  const behavior = (editForm.behavior_config || {}) as Record<string, any>;
  const handoffRules = (editForm.handoff_rules || []) as Array<{ label: string; keywords: string; enabled: boolean }>;

  const updateKB = (key: string, value: string) => {
    setEditForm({ ...editForm, knowledge_base: { ...kb, [key]: value } });
  };

  const updateBehavior = (key: string, value: any) => {
    setEditForm({ ...editForm, behavior_config: { ...behavior, [key]: value } });
  };

  const updateHandoffRule = (idx: number, field: string, value: any) => {
    const updated = [...handoffRules];
    updated[idx] = { ...updated[idx], [field]: value };
    setEditForm({ ...editForm, handoff_rules: updated });
  };

  const addHandoffRule = () => {
    setEditForm({ ...editForm, handoff_rules: [...handoffRules, { label: "Nova regra", keywords: "", enabled: true }] });
  };

  const removeHandoffRule = (idx: number) => {
    setEditForm({ ...editForm, handoff_rules: handoffRules.filter((_, i) => i !== idx) });
  };

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Agents List */}
      <Card className="col-span-1">
        <CardHeader className="py-3 px-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Agentes</CardTitle>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={createAgent}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2 space-y-1">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgentId(agent.id)}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                selectedAgentId === agent.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <div className="font-medium text-sm">{agent.name}</div>
              <div className="text-xs opacity-70">{agent.is_active ? "Ativo" : "Inativo"}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Config Tabs */}
      <Card className="col-span-3">
        {selectedAgentId ? (
          <Tabs defaultValue="prompt" className="h-full">
            <CardHeader className="py-3 px-4 border-b">
              <div className="flex items-center justify-between">
                <TabsList className="h-8">
                  <TabsTrigger value="prompt" className="text-xs gap-1 h-7"><Brain className="h-3 w-3" /> Prompt</TabsTrigger>
                  <TabsTrigger value="knowledge" className="text-xs gap-1 h-7"><BookOpen className="h-3 w-3" /> Conhecimento</TabsTrigger>
                  <TabsTrigger value="behavior" className="text-xs gap-1 h-7"><Settings2 className="h-3 w-3" /> Comportamento</TabsTrigger>
                  <TabsTrigger value="handoff" className="text-xs gap-1 h-7"><Shield className="h-3 w-3" /> Handoff</TabsTrigger>
                  <TabsTrigger value="usage" className="text-xs gap-1 h-7"><BarChart3 className="h-3 w-3" /> Uso</TabsTrigger>
                </TabsList>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" className="h-7" onClick={() => deleteAgent(selectedAgentId)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  <Button size="sm" className="h-7" onClick={saveAgent} disabled={loading}>
                    <Save className="h-3 w-3 mr-1" /> Salvar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {/* System Prompt Tab */}
              <TabsContent value="prompt" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome do Agente</Label>
                    <Input value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Modelo</Label>
                    <Select value={editForm.model} onValueChange={(v) => setEditForm({ ...editForm, model: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input value={editForm.description || ""} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Breve descrição" />
                </div>
                <div className="space-y-2">
                  <Label>System Prompt</Label>
                  <Textarea value={editForm.system_prompt || ""} onChange={(e) => setEditForm({ ...editForm, system_prompt: e.target.value })} rows={8} placeholder="Instruções de sistema..." />
                  <p className="text-xs text-muted-foreground">Variáveis: {"{{lead.name}}, {{lead.status}}, {{lead.score}}, {{studio_name}}"}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Temperatura ({(editForm.temperature ?? 0.7).toFixed(1)})</Label>
                    <Slider value={[editForm.temperature || 0.7]} onValueChange={([v]) => setEditForm({ ...editForm, temperature: v })} min={0} max={1} step={0.1} />
                  </div>
                  <div className="space-y-2">
                    <Label>Máx Tokens</Label>
                    <Input type="number" value={editForm.max_tokens || 2000} onChange={(e) => setEditForm({ ...editForm, max_tokens: parseInt(e.target.value) })} min={100} max={8000} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Agente Ativo</Label>
                  <Switch checked={editForm.is_active || false} onCheckedChange={(c) => setEditForm({ ...editForm, is_active: c })} />
                </div>
              </TabsContent>

              {/* Knowledge Base Tab */}
              <TabsContent value="knowledge" className="space-y-4 mt-0">
                <p className="text-sm text-muted-foreground">Dados do studio que o agente usará como contexto.</p>
                {[
                  { key: "studio_name", label: "Nome do Studio" },
                  { key: "coordinator", label: "Coordenador(a)" },
                  { key: "modalities", label: "Modalidades Oferecidas" },
                  { key: "session_duration", label: "Duração das Sessões" },
                  { key: "age_range", label: "Faixa Etária Atendida" },
                  { key: "schedule", label: "Horários de Funcionamento" },
                  { key: "address", label: "Endereço" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-sm">{label}</Label>
                    <Input value={kb[key] || ""} onChange={(e) => updateKB(key, e.target.value)} />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label className="text-sm">Informações Adicionais</Label>
                  <Textarea value={kb.additional_info || ""} onChange={(e) => updateKB("additional_info", e.target.value)} rows={3} placeholder="Diferenciais, regras, etc." />
                </div>
              </TabsContent>

              {/* Behavior Tab */}
              <TabsContent value="behavior" className="space-y-4 mt-0">
                <div className="flex items-center justify-between py-2">
                  <div><Label>Auto-responder</Label><p className="text-xs text-muted-foreground">Responder automaticamente novas mensagens</p></div>
                  <Switch checked={behavior.auto_respond ?? true} onCheckedChange={(c) => updateBehavior("auto_respond", c)} />
                </div>
                <div className="flex items-center justify-between py-2">
                  <div><Label>Simular timing humano</Label><p className="text-xs text-muted-foreground">Adicionar delay antes de responder</p></div>
                  <Switch checked={behavior.human_timing ?? false} onCheckedChange={(c) => updateBehavior("human_timing", c)} />
                </div>
                <div className="flex items-center justify-between py-2">
                  <div><Label>Auto-agendar trial</Label><p className="text-xs text-muted-foreground">Sugerir agendamento automaticamente</p></div>
                  <Switch checked={behavior.auto_schedule_trial ?? false} onCheckedChange={(c) => updateBehavior("auto_schedule_trial", c)} />
                </div>
                <div className="space-y-2">
                  <Label>Máx mensagens antes de handoff ({behavior.max_messages_before_handoff || 10})</Label>
                  <Slider value={[behavior.max_messages_before_handoff || 10]} onValueChange={([v]) => updateBehavior("max_messages_before_handoff", v)} min={3} max={30} step={1} />
                </div>
                <div className="space-y-2">
                  <Label>Threshold de qualificação ({behavior.qualification_threshold || 70})</Label>
                  <Slider value={[behavior.qualification_threshold || 70]} onValueChange={([v]) => updateBehavior("qualification_threshold", v)} min={10} max={100} step={5} />
                  <p className="text-xs text-muted-foreground">Score mínimo para considerar lead qualificado</p>
                </div>
              </TabsContent>

              {/* Handoff Tab */}
              <TabsContent value="handoff" className="space-y-4 mt-0">
                <p className="text-sm text-muted-foreground">Palavras-chave que disparam transferência para humano.</p>
                {handoffRules.map((rule, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Input value={rule.label} onChange={(e) => updateHandoffRule(idx, "label", e.target.value)} className="h-8 w-48" />
                      <div className="flex items-center gap-2">
                        <Switch checked={rule.enabled} onCheckedChange={(c) => updateHandoffRule(idx, "enabled", c)} />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeHandoffRule(idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Input value={rule.keywords} onChange={(e) => updateHandoffRule(idx, "keywords", e.target.value)} placeholder="Palavras separadas por vírgula" className="h-8" />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addHandoffRule}><Plus className="h-3 w-3 mr-1" /> Adicionar Regra</Button>
              </TabsContent>

              {/* Usage Tab */}
              <TabsContent value="usage" className="mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <KPICard title="Mensagens este mês" value={usageStats.total_messages.toString()} icon={BarChart3} />
                  <KPICard title="Tokens de entrada" value={usageStats.total_input_tokens.toLocaleString()} icon={Brain} />
                  <KPICard title="Tokens de saída" value={usageStats.total_output_tokens.toLocaleString()} icon={Brain} />
                  <KPICard title="Custo estimado" value={`R$ ${(usageStats.total_cost_cents / 100).toFixed(2)}`} icon={BarChart3} />
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground"><p>Selecione ou crie um agente</p></div>
        )}
      </Card>
    </div>
  );
}
