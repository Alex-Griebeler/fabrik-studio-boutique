import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Phone, Mail, Thermometer, Target, Calendar, Tag } from "lucide-react";
import type { Conversation } from "@/hooks/useConversations";

interface LeadContextPanelProps {
  conversation: Conversation | null;
}

const tempColors: Record<string, string> = {
  hot: "bg-red-500 text-white",
  warm: "bg-amber-500 text-white",
  cold: "bg-blue-500 text-white",
};

export function LeadContextPanel({ conversation }: LeadContextPanelProps) {
  if (!conversation?.leads) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground p-4">
        <p className="text-sm text-center">Selecione uma conversa para ver o contexto do lead</p>
      </div>
    );
  }

  const lead = conversation.leads;

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-lg">{lead.name}</h3>
        <Badge variant="outline" className="mt-1">{lead.status}</Badge>
      </div>

      <Separator />

      <div className="space-y-3">
        {lead.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{lead.phone}</span>
          </div>
        )}
        {lead.email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span>Score</span>
          </div>
          <span className="font-semibold">{lead.qualification_score}</span>
        </div>

        {lead.temperature && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Thermometer className="h-4 w-4 text-muted-foreground" />
              <span>Temperatura</span>
            </div>
            <Badge className={tempColors[lead.temperature] || ""}>{lead.temperature}</Badge>
          </div>
        )}

        {lead.trial_date && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Trial</span>
            </div>
            <span className="text-sm">{lead.trial_date}</span>
          </div>
        )}
      </div>

      {lead.tags && lead.tags.length > 0 && (
        <>
          <Separator />
          <div>
            <div className="flex items-center gap-2 text-sm mb-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span>Tags</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {lead.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          </div>
        </>
      )}

      <Separator />

      <div className="text-xs text-muted-foreground">
        <p>Canal: {conversation.channel}</p>
        <p>Status conversa: {conversation.status}</p>
        {conversation.taken_over_by && <p className="text-blue-600 font-medium">Controlada por humano</p>}
      </div>
    </div>
  );
}
