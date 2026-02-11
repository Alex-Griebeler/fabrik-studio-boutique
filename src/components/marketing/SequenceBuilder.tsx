import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Save, GripVertical } from "lucide-react";

interface NurturingSequence {
  id: string;
  name: string;
  description: string | null;
  trigger_status: string | null;
  is_active: boolean;
  created_at: string;
}

interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  delay_hours: number;
  message_template_id: string | null;
  message_content: string | null;
  action_type: string | null;
  order_num: number | null;
}

export function SequenceBuilder() {
  const [sequences, setSequences] = useState<NurturingSequence[]>([]);
  const [selectedSeqId, setSelectedSeqId] = useState<string | null>(null);
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [editForm, setEditForm] = useState<Partial<NurturingSequence>>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSequences();
  }, []);

  useEffect(() => {
    if (selectedSeqId) {
      const seq = sequences.find(s => s.id === selectedSeqId);
      if (seq) {
        setEditForm(seq);
        loadSteps(selectedSeqId);
      }
    }
  }, [selectedSeqId]);

  const loadSequences = async () => {
    try {
      const { data, error } = await supabase
        .from("nurturing_sequences")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSequences(data || []);
      if (data && data.length > 0 && !selectedSeqId) {
        setSelectedSeqId(data[0].id);
      }
    } catch (error) {
      toast({
        title: "Erro ao carregar sequências",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  };

  const loadSteps = async (seqId: string) => {
    try {
      const { data, error } = await supabase
        .from("sequence_steps")
        .select("*")
        .eq("sequence_id", seqId)
        .order("step_number", { ascending: true });

      if (error) throw error;
      setSteps(data || []);
    } catch (error) {
      toast({
        title: "Erro ao carregar passos",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  };

  const handleSaveSequence = async () => {
    if (!selectedSeqId || !editForm.name) {
      toast({
        title: "Erro",
        description: "Nome da sequência é obrigatório",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("nurturing_sequences")
        .update({
          name: editForm.name,
          description: editForm.description,
          trigger_status: editForm.trigger_status,
          is_active: editForm.is_active
        })
        .eq("id", selectedSeqId);

      if (error) throw error;
      
      loadSequences();
      toast({ title: "Sequência atualizada com sucesso" });
    } catch (error) {
      toast({
        title: "Erro ao salvar sequência",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSequence = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("nurturing_sequences")
        .insert({
          name: "Nova Sequência",
          is_active: true
        })
        .select();

      if (error) throw error;
      if (data && data.length > 0) {
        setSelectedSeqId(data[0].id);
        loadSequences();
        toast({ title: "Sequência criada com sucesso" });
      }
    } catch (error) {
      toast({
        title: "Erro ao criar sequência",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddStep = async () => {
    if (!selectedSeqId) return;

    try {
      const nextStep = (steps.length > 0 ? Math.max(...steps.map(s => s.step_number)) : 0) + 1;
      
      const { data, error } = await supabase
        .from("sequence_steps")
        .insert({
          sequence_id: selectedSeqId,
          step_number: nextStep,
          delay_hours: 0,
          message_content: "Novo passo"
        })
        .select();

      if (error) throw error;
      loadSteps(selectedSeqId);
      toast({ title: "Passo adicionado com sucesso" });
    } catch (error) {
      toast({
        title: "Erro ao adicionar passo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    try {
      const { error } = await supabase
        .from("sequence_steps")
        .delete()
        .eq("id", stepId);

      if (error) throw error;
      
      if (selectedSeqId) {
        loadSteps(selectedSeqId);
      }
      toast({ title: "Passo deletado com sucesso" });
    } catch (error) {
      toast({
        title: "Erro ao deletar passo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  };

  const handleDeleteSequence = async (seqId: string) => {
    try {
      const { error } = await supabase
        .from("nurturing_sequences")
        .delete()
        .eq("id", seqId);

      if (error) throw error;
      
      if (selectedSeqId === seqId) {
        setSelectedSeqId(null);
      }
      loadSequences();
      toast({ title: "Sequência deletada com sucesso" });
    } catch (error) {
      toast({
        title: "Erro ao deletar sequência",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Sequences List */}
      <Card className="col-span-1">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Sequências</CardTitle>
              <CardDescription>Automação de nurturing</CardDescription>
            </div>
            <Button size="sm" onClick={handleCreateSequence}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {sequences.map((seq) => (
            <button
              key={seq.id}
              onClick={() => setSelectedSeqId(seq.id)}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                selectedSeqId === seq.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              <div className="font-medium text-sm">{seq.name}</div>
              <div className="text-xs opacity-70">
                {seq.is_active ? "Ativa" : "Inativa"}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Sequence Config */}
      <Card className="col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Configuração da Sequência</CardTitle>
              <CardDescription>Passos e automações</CardDescription>
            </div>
            {selectedSeqId && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteSequence(selectedSeqId)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {selectedSeqId ? (
            <>
              <div className="space-y-2">
                <Label>Nome da Sequência</Label>
                <Input
                  value={editForm.name || ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Ex: Sequência de Onboarding"
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={editForm.description || ""}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Descrição da sequência"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Status de Disparo</Label>
                <Select value={editForm.trigger_status || ""} onValueChange={(value) => setEditForm({ ...editForm, trigger_status: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um trigger" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Lead Novo</SelectItem>
                    <SelectItem value="contacted">Contatado</SelectItem>
                    <SelectItem value="trial_scheduled">Experimental Agendado</SelectItem>
                    <SelectItem value="converted">Convertido</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label>Ativa</Label>
                <Switch
                  checked={editForm.is_active || false}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked })}
                />
              </div>

              <Button onClick={handleSaveSequence} disabled={loading} className="w-full">
                <Save className="h-4 w-4 mr-2" />
                Salvar Sequência
              </Button>

              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Passos da Sequência</h3>
                  <Button size="sm" variant="outline" onClick={handleAddStep}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Passo
                  </Button>
                </div>

                <div className="space-y-3">
                  {steps.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum passo adicionado
                    </p>
                  ) : (
                    steps.map((step, idx) => (
                      <div key={step.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 opacity-50" />
                            <span className="font-medium">Passo {step.step_number}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteStep(step.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label className="text-sm">Atraso (horas)</Label>
                            <Input type="number" defaultValue={step.delay_hours} min={0} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Tipo de Ação</Label>
                            <Select defaultValue={step.action_type || ""}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="email">Email</SelectItem>
                                <SelectItem value="sms">SMS</SelectItem>
                                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Mensagem</Label>
                          <Textarea
                            defaultValue={step.message_content || ""}
                            placeholder="Conteúdo da mensagem"
                            rows={2}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-96 text-muted-foreground">
              <p>Selecione ou crie uma sequência</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
