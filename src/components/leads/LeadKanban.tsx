import { useState, useMemo } from "react";
import { Phone, Mail, MessageSquare, Eye, Plus, UserCheck, X, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Student } from "@/hooks/useStudents";
import {
  type LeadStage,
  leadStageLabels,
  useUpdateLeadStage,
  useConvertLeadToStudent,
} from "@/hooks/useLeads";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  leads: (Student & { lead_stage: LeadStage })[];
  onSelectLead: (lead: Student & { lead_stage: LeadStage }) => void;
  onNewInteraction: (leadId: string) => void;
}

const KANBAN_COLUMNS: { stage: LeadStage; icon: React.ReactNode }[] = [
  { stage: "new", icon: <Plus className="h-3.5 w-3.5" /> },
  { stage: "contacted", icon: <Phone className="h-3.5 w-3.5" /> },
  { stage: "trial", icon: <Eye className="h-3.5 w-3.5" /> },
  { stage: "negotiation", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { stage: "converted", icon: <UserCheck className="h-3.5 w-3.5" /> },
  { stage: "lost", icon: <X className="h-3.5 w-3.5" /> },
];

export function LeadKanban({ leads, onSelectLead, onNewInteraction }: Props) {
  const updateStage = useUpdateLeadStage();
  const convertLead = useConvertLeadToStudent();
  const [convertDialog, setConvertDialog] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<LeadStage, typeof leads> = {
      new: [], contacted: [], trial: [], negotiation: [], converted: [], lost: [],
    };
    leads.forEach((l) => {
      const stage = (l.lead_stage || "new") as LeadStage;
      if (map[stage]) map[stage].push(l);
    });
    return map;
  }, [leads]);

  const handleDrop = (stage: LeadStage) => {
    if (!draggedId) return;
    const lead = leads.find((l) => l.id === draggedId);
    if (!lead || lead.lead_stage === stage) {
      setDraggedId(null);
      return;
    }

    if (stage === "converted") {
      setConvertDialog(draggedId);
    } else {
      updateStage.mutate({ id: draggedId, stage });
    }
    setDraggedId(null);
  };

  const handleConvert = () => {
    if (convertDialog) {
      convertLead.mutate(convertDialog);
      setConvertDialog(null);
    }
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map(({ stage, icon }) => {
          const items = grouped[stage];
          return (
            <div
              key={stage}
              className="flex-shrink-0 w-[260px] flex flex-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage)}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-muted-foreground">{icon}</span>
                <span className="text-sm font-semibold text-foreground">{leadStageLabels[stage]}</span>
                <Badge variant="secondary" className="ml-auto text-xs">{items.length}</Badge>
              </div>

              {/* Column body */}
              <ScrollArea className="flex-1 rounded-lg border bg-muted/30 p-2 min-h-[200px] max-h-[calc(100vh-320px)]">
                <div className="space-y-2">
                  {items.map((lead) => (
                    <Card
                      key={lead.id}
                      draggable
                      onDragStart={() => setDraggedId(lead.id)}
                      className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <button
                            onClick={() => onSelectLead(lead)}
                            className="text-sm font-medium text-foreground hover:text-primary text-left transition-colors"
                          >
                            {lead.full_name}
                          </button>
                        </div>

                        {(lead.phone || lead.email) && (
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            {lead.phone && <p>{lead.phone}</p>}
                            {lead.email && <p className="truncate">{lead.email}</p>}
                          </div>
                        )}

                        {lead.lead_source && (
                          <Badge variant="outline" className="text-[10px]">
                            {lead.lead_source}
                          </Badge>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                          <div className="flex gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onNewInteraction(lead.id)}>
                                  <MessageSquare className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Nova interação</TooltipContent>
                            </Tooltip>
                            {stage !== "converted" && stage !== "lost" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    onClick={() => {
                                      const nextStages: Partial<Record<LeadStage, LeadStage>> = {
                                        new: "contacted",
                                        contacted: "trial",
                                        trial: "negotiation",
                                        negotiation: "converted",
                                      };
                                      const next = nextStages[stage];
                                      if (next === "converted") {
                                        setConvertDialog(lead.id);
                                      } else if (next) {
                                        updateStage.mutate({ id: lead.id, stage: next });
                                      }
                                    }}
                                  >
                                    <ArrowRight className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Avançar etapa</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {items.length === 0 && (
                    <p className="text-xs text-muted-foreground/50 text-center py-8">Nenhum lead</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>

      {/* Convert confirmation */}
      <AlertDialog open={!!convertDialog} onOpenChange={() => setConvertDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Converter Lead em Aluno?</AlertDialogTitle>
            <AlertDialogDescription>
              O lead será convertido em aluno ativo. Você poderá então criar um contrato e plano para ele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvert}>Converter</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
