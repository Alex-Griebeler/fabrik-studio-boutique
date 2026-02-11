import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useInteractions,
  interactionTypeLabels,
  interactionTypeIcons,
  leadStatusLabels,
  leadStatusColors,
  type Lead,
  type LeadStatus,
} from "@/hooks/useLeads";
import { TemplateSelector } from "./TemplateSelector";
import { calculateLeadScore, gradeColors } from "@/lib/leadScoring";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare, UserCheck, XCircle, CalendarCheck } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onNewInteraction: () => void;
  onConvert: () => void;
  onScheduleTrial?: () => void;
  onMarkLost?: () => void;
}

export function LeadDetailDialog({ open, onOpenChange, lead, onNewInteraction, onConvert, onScheduleTrial, onMarkLost }: Props) {
  const { data: interactions, isLoading } = useInteractions(lead?.id ?? "");
  const [messageTab, setMessageTab] = useState("templates");

  if (!lead) return null;

  const status = (lead.status || "new") as LeadStatus;
  const { score, grade } = calculateLeadScore(lead.qualification_details ?? {});
  const details = lead.qualification_details ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lead.name}
            <Badge variant="outline" className={leadStatusColors[status]}>
              {leadStatusLabels[status]}
            </Badge>
            <Badge variant="outline" className={gradeColors[grade]}>
              {grade} ({score}pts)
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Lead info */}
        <div className="space-y-2 text-sm">
          {lead.phone && <p><span className="text-muted-foreground">Telefone:</span> {lead.phone}</p>}
          {lead.email && <p><span className="text-muted-foreground">Email:</span> {lead.email}</p>}
          {lead.source && <p><span className="text-muted-foreground">Origem:</span> {lead.source}</p>}
          {lead.notes && <p><span className="text-muted-foreground">Notas:</span> {lead.notes}</p>}
          {lead.trial_date && (
            <p>
              <span className="text-muted-foreground">Trial:</span>{" "}
              {format(new Date(lead.trial_date), "dd/MM/yyyy", { locale: ptBR })}
              {lead.trial_time && ` às ${lead.trial_time}`}
              {lead.trial_type && ` (${lead.trial_type})`}
            </p>
          )}
          {lead.lost_reason && <p><span className="text-muted-foreground">Motivo de perda:</span> {lead.lost_reason}</p>}
        </div>

        {/* Qualification details */}
        {Object.keys(details).length > 0 && (
          <div className="space-y-1 text-sm border-t border-border pt-2">
            <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Qualificação</p>
            {details.objective && <p><span className="text-muted-foreground">Objetivo:</span> {details.objective}</p>}
            {details.profession && <p><span className="text-muted-foreground">Profissão:</span> {details.profession}</p>}
            {details.age_range && <p><span className="text-muted-foreground">Faixa etária:</span> {details.age_range}</p>}
            {details.preferred_time && <p><span className="text-muted-foreground">Horário:</span> {details.preferred_time}</p>}
            {details.has_trained_before !== undefined && (
              <p><span className="text-muted-foreground">Já treinou:</span> {details.has_trained_before ? "Sim" : "Não"}</p>
            )}
          </div>
        )}

        {/* Tags */}
        {lead.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {lead.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
            ))}
          </div>
        )}

        {/* Templates + Actions */}
        <div className="pt-2 border-t border-border">
          <Tabs defaultValue="actions" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="actions">Ações</TabsTrigger>
              <TabsTrigger value="templates">Mensagens</TabsTrigger>
            </TabsList>

            <TabsContent value="actions" className="mt-4">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={onNewInteraction}>
                  <MessageSquare className="h-4 w-4 mr-1" /> Nova Interação
                </Button>
                {status !== "converted" && status !== "trial_scheduled" && onScheduleTrial && (
                  <Button size="sm" variant="outline" onClick={onScheduleTrial}>
                    <CalendarCheck className="h-4 w-4 mr-1" /> Agendar Trial
                  </Button>
                )}
                {status !== "converted" && status !== "lost" && (
                  <Button size="sm" onClick={onConvert}>
                    <UserCheck className="h-4 w-4 mr-1" /> Converter
                  </Button>
                )}
                {status !== "converted" && status !== "lost" && onMarkLost && (
                  <Button size="sm" variant="destructive" onClick={onMarkLost}>
                    <XCircle className="h-4 w-4 mr-1" /> Perdido
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="templates" className="mt-4">
              <TemplateSelector lead={lead} />
            </TabsContent>
          </Tabs>
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
                        <p className="text-xs mt-0.5 text-muted-foreground">
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
