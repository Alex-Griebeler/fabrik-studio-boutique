import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Save, ArrowDown, Clock, MessageSquare, Smartphone, Mail, BarChart3, List } from "lucide-react";
import { useNurturingSequences, NurturingSequence } from "@/hooks/useNurturingSequences";
import { KPICard } from "@/components/shared/KPICard";

const channelOptions = [
  { value: "whatsapp", label: "WhatsApp", icon: Smartphone },
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS", icon: MessageSquare },
];

const triggerOptions = [
  { value: "new", label: "Lead Novo" },
  { value: "contacted", label: "Contatado" },
  { value: "trial_scheduled", label: "Experimental Agendado" },
  { value: "converted", label: "Convertido" },
];

export function SequenceBuilder() {
  const {
    sequences, selectedSeqId, setSelectedSeqId, selectedSequence,
    steps, executions, loading,
    createSequence, saveSequence, deleteSequence,
    addStep, updateStep, deleteStep,
  } = useNurturingSequences();

  const [editForm, setEditForm] = useState<Record<string, any>>({});

  // Sync edit form when sequence changes
  const currentForm = selectedSequence ? { ...selectedSequence, ...editForm } : editForm;

  const handleSelectSequence = (id: string) => {
    setSelectedSeqId(id);
    setEditForm({});
  };

   const handleSave = () => {
     saveSequence({ ...selectedSequence, ...editForm } as Partial<NurturingSequence>);
     setEditForm({});
   };

  const runningCount = executions.filter(e => e.status === "running").length;
  const completedCount = executions.filter(e => e.status === "completed").length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {/* Sequences List */}
      <Card className="col-span-1">
        <CardHeader className="py-3 px-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Sequências</CardTitle>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={createSequence}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <ScrollArea className="h-[500px]">
          <div className="p-2 space-y-1">
            {sequences.map((seq) => (
              <button
                key={seq.id}
                onClick={() => handleSelectSequence(seq.id)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  selectedSeqId === seq.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <div className="font-medium text-sm">{seq.name}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant={seq.is_active ? "default" : "secondary"} className="text-[10px]">
                    {seq.is_active ? "Ativa" : "Inativa"}
                  </Badge>
                  {seq.trigger_status && (
                    <Badge variant="outline" className="text-[10px]">{seq.trigger_status}</Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Builder */}
      <Card className="md:col-span-2 lg:col-span-3">
        {selectedSeqId ? (
          <Tabs defaultValue="builder">
            <CardHeader className="py-3 px-4 border-b">
              <div className="flex items-center justify-between">
                <TabsList className="h-8">
                  <TabsTrigger value="builder" className="text-xs gap-1 h-7"><List className="h-3 w-3" /> Builder</TabsTrigger>
                  <TabsTrigger value="analytics" className="text-xs gap-1 h-7"><BarChart3 className="h-3 w-3" /> Analytics</TabsTrigger>
                </TabsList>
                <div className="flex gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="h-7">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir sequência?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita. A sequência e todos os seus passos serão removidos permanentemente.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteSequence(selectedSeqId)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button size="sm" className="h-7" onClick={handleSave} disabled={loading}>
                    <Save className="h-3 w-3 mr-1" /> Salvar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <TabsContent value="builder" className="space-y-4 mt-0">
                {/* Sequence Config */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Nome</Label>
                    <Input value={currentForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Trigger</Label>
                    <Select value={currentForm.trigger_status || ""} onValueChange={(v) => setEditForm({ ...editForm, trigger_status: v })}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {triggerOptions.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="space-y-1 flex-1">
                      <Label className="text-sm">Status</Label>
                      <div className="flex items-center gap-2 h-8">
                        <Switch checked={currentForm.is_active ?? true} onCheckedChange={(c) => setEditForm({ ...editForm, is_active: c })} />
                        <span className="text-sm">{currentForm.is_active ? "Ativa" : "Inativa"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm">Descrição</Label>
                  <Textarea value={currentForm.description || ""} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="resize-none" />
                </div>

                {/* Visual Timeline */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">Passos da Sequência</h3>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addStep}>
                      <Plus className="h-3 w-3 mr-1" /> Passo
                    </Button>
                  </div>

                  <div className="space-y-0">
                    {steps.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p className="text-sm">Nenhum passo. Clique em "+ Passo" para começar.</p>
                      </div>
                    ) : (
                      steps.map((step, idx) => (
                        <div key={step.id}>
                          {idx > 0 && (
                            <div className="flex items-center justify-center py-1">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <ArrowDown className="h-4 w-4" />
                                <Clock className="h-3 w-3" />
                                <span className="text-xs">{step.delay_hours}h</span>
                              </div>
                            </div>
                          )}
                          <div className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">{step.step_number}</Badge>
                                <Badge variant="secondary" className="text-xs gap-1">
                                  {step.channel === "whatsapp" && <Smartphone className="h-3 w-3" />}
                                  {step.channel === "email" && <Mail className="h-3 w-3" />}
                                  {step.channel}
                                </Badge>
                              </div>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteStep(step.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Delay (horas)</Label>
                                <Input type="number" value={step.delay_hours} onChange={(e) => updateStep(step.id, { delay_hours: parseInt(e.target.value) || 0 })} className="h-7 text-xs" min={0} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Canal</Label>
                                <Select value={step.channel} onValueChange={(v) => updateStep(step.id, { channel: v })}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {channelOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Mensagem</Label>
                              <Textarea
                                value={step.message_content || ""}
                                onChange={(e) => updateStep(step.id, { message_content: e.target.value })}
                                rows={2}
                                className="resize-none text-xs"
                                placeholder="Use {{lead.name}}, {{trial.date}} como variáveis"
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Analytics Tab */}
              <TabsContent value="analytics" className="mt-0">
                <div className="grid grid-cols-3 gap-4">
                  <KPICard title="Execuções Ativas" value={runningCount.toString()} icon={Smartphone} />
                  <KPICard title="Completadas" value={completedCount.toString()} icon={BarChart3} />
                  <KPICard title="Total" value={executions.length.toString()} icon={List} />
                </div>
                {executions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma execução registrada para esta sequência.</p>
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground"><p>Selecione ou crie uma sequência</p></div>
        )}
      </Card>
    </div>
  );
}
