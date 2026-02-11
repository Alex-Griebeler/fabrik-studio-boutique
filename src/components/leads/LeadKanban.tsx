import { useState, useMemo } from "react";
import { Phone, MessageSquare, Eye, Plus, UserCheck, X, ArrowRight, Star } from "lucide-react";
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
import {
  type Lead,
  type LeadStatus,
  leadStatusLabels,
  useUpdateLeadStatus,
  useConvertLead,
} from "@/hooks/useLeads";
import { calculateLeadScore, gradeColors } from "@/lib/leadScoring";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  onNewInteraction: (leadId: string) => void;
}

const PIPELINE: { status: LeadStatus; icon: React.ReactNode }[] = [
  { status: "new", icon: <Plus className="h-3.5 w-3.5" /> },
  { status: "contacted", icon: <Phone className="h-3.5 w-3.5" /> },
  { status: "qualified", icon: <Star className="h-3.5 w-3.5" /> },
  { status: "trial_scheduled", icon: <Eye className="h-3.5 w-3.5" /> },
  { status: "converted", icon: <UserCheck className="h-3.5 w-3.5" /> },
];

const NEXT_STATUS: Partial<Record<LeadStatus, LeadStatus>> = {
  new: "contacted",
  contacted: "qualified",
  qualified: "trial_scheduled",
  trial_scheduled: "converted",
};

export function LeadKanban({ leads, onSelectLead, onNewInteraction }: Props) {
  const updateStatus = useUpdateLeadStatus();
  const convertLead = useConvertLead();
  const [convertDialog, setConvertDialog] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<LeadStatus, Lead[]> = {
      new: [], contacted: [], qualified: [], trial_scheduled: [], converted: [], lost: [],
    };
    leads.forEach((l) => {
      const s = (l.status || "new") as LeadStatus;
      if (map[s]) map[s].push(l);
    });
    return map;
  }, [leads]);

  const lostCount = grouped.lost.length;

  const handleDrop = (status: LeadStatus) => {
    if (!draggedId) return;
    const lead = leads.find((l) => l.id === draggedId);
    if (!lead || lead.status === status) {
      setDraggedId(null);
      return;
    }
    if (status === "converted") {
      setConvertDialog(draggedId);
    } else {
      updateStatus.mutate({ id: draggedId, status });
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
      {lostCount > 0 && (
        <div className="mb-3 text-xs text-muted-foreground flex items-center gap-1.5">
          <X className="h-3.5 w-3.5" />
          <span>{lostCount} lead(s) perdido(s) — use os filtros para visualizar</span>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE.map(({ status, icon }) => {
          const items = grouped[status];
          return (
            <div
              key={status}
              className="flex-shrink-0 w-[260px] flex flex-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(status)}
            >
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-muted-foreground">{icon}</span>
                <span className="text-sm font-semibold text-foreground">{leadStatusLabels[status]}</span>
                <Badge variant="secondary" className="ml-auto text-xs">{items.length}</Badge>
              </div>

              <ScrollArea className="flex-1 rounded-lg border bg-muted/30 p-2 min-h-[200px] max-h-[calc(100vh-320px)]">
                <div className="space-y-2">
                  {items.map((lead) => {
                    const { grade } = calculateLeadScore(lead.qualification_details ?? {});
                    return (
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
                              {lead.name}
                            </button>
                            <Badge variant="outline" className={`text-[10px] ${gradeColors[grade]}`}>
                              {grade}
                            </Badge>
                          </div>

                          {(lead.phone || lead.email) && (
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              {lead.phone && <p>{lead.phone}</p>}
                              {lead.email && <p className="truncate">{lead.email}</p>}
                            </div>
                          )}

                            <div className="flex items-center gap-1">
                             {lead.temperature && (
                               <Badge variant="outline" className={`text-[10px] ${lead.temperature === "hot" ? "border-red-300 text-red-600" : lead.temperature === "warm" ? "border-yellow-300 text-yellow-600" : "border-blue-300 text-blue-600"}`}>
                                 {lead.temperature === "hot" ? "🔥" : lead.temperature === "warm" ? "🌤" : "❄️"}
                               </Badge>
                             )}
                             {lead.source && (
                               <Badge variant="outline" className="text-[10px]">
                                 {lead.source}
                               </Badge>
                             )}
                           </div>

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
                              {status !== "converted" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      onClick={() => {
                                        const next = NEXT_STATUS[status];
                                        if (next === "converted") {
                                          setConvertDialog(lead.id);
                                        } else if (next) {
                                          updateStatus.mutate({ id: lead.id, status: next });
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
                    );
                  })}
                  {items.length === 0 && (
                    <p className="text-xs text-muted-foreground/50 text-center py-8">Nenhum lead</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>

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
