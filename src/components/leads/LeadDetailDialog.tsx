import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useInteractions,
  interactionTypeLabels,
  interactionTypeIcons,
  leadStageLabels,
  leadStageColors,
  type LeadStage,
} from "@/hooks/useLeads";
import type { Student } from "@/hooks/useStudents";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare, UserCheck } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: (Student & { lead_stage: LeadStage }) | null;
  onNewInteraction: () => void;
  onConvert: () => void;
}

export function LeadDetailDialog({ open, onOpenChange, lead, onNewInteraction, onConvert }: Props) {
  const { data: interactions, isLoading } = useInteractions(lead?.id ?? "");

  if (!lead) return null;

  const stage = (lead.lead_stage || "new") as LeadStage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lead.full_name}
            <Badge variant="outline" className={leadStageColors[stage]}>
              {leadStageLabels[stage]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Lead info */}
        <div className="space-y-2 text-sm">
          {lead.phone && <p><span className="text-muted-foreground">Telefone:</span> {lead.phone}</p>}
          {lead.email && <p><span className="text-muted-foreground">Email:</span> {lead.email}</p>}
          {lead.lead_source && <p><span className="text-muted-foreground">Origem:</span> {lead.lead_source}</p>}
          {lead.notes && <p><span className="text-muted-foreground">Notas:</span> {lead.notes}</p>}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-border">
          <Button size="sm" variant="outline" onClick={onNewInteraction}>
            <MessageSquare className="h-4 w-4 mr-1" /> Nova Interação
          </Button>
          {stage !== "converted" && (
            <Button size="sm" onClick={onConvert}>
              <UserCheck className="h-4 w-4 mr-1" /> Converter em Aluno
            </Button>
          )}
        </div>

        {/* Interactions timeline */}
        <div className="pt-2 border-t border-border">
          <p className="text-sm font-semibold mb-3">Histórico de Interações</p>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !interactions?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma interação registrada</p>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-3">
                {interactions.map((int) => (
                  <div key={int.id} className="flex gap-3 text-sm">
                    <span className="text-lg shrink-0 mt-0.5">
                      {interactionTypeIcons[int.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{interactionTypeLabels[int.type]}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(int.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-muted-foreground">{int.description}</p>
                      {int.scheduled_at && (
                        <p className="text-xs text-info mt-0.5">
                          Agendado: {format(new Date(int.scheduled_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
