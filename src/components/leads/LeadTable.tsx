import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, MessageSquare, CalendarCheck, UserCheck, XCircle, Eye } from "lucide-react";
import { type Lead, type LeadStatus, leadStatusLabels, leadStatusColors } from "@/hooks/useLeads";
import { calculateLeadScore, gradeColors } from "@/lib/leadScoring";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  onNewInteraction: (leadId: string) => void;
  onScheduleTrial: (leadId: string) => void;
  onConvert: (leadId: string) => void;
  onMarkLost: (leadId: string) => void;
}

export function LeadTable({ leads, onSelectLead, onNewInteraction, onScheduleTrial, onConvert, onMarkLost }: Props) {
  if (!leads.length) {
    return (
      <div className="text-center text-muted-foreground py-12 border rounded-lg bg-card">
        <p className="text-sm">Nenhum lead encontrado</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead className="hidden sm:table-cell">Contato</TableHead>
            <TableHead>Origem</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Criado</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const { grade } = calculateLeadScore(lead.qualification_details ?? {});
            const status = lead.status as LeadStatus;
            return (
              <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectLead(lead)}>
                <TableCell className="font-medium">{lead.name}</TableCell>
                <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                  {lead.phone || lead.email || "—"}
                </TableCell>
                <TableCell>
                  {lead.source ? <Badge variant="outline" className="text-[10px]">{lead.source}</Badge> : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${gradeColors[grade]}`}>{grade}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${leadStatusColors[status]}`}>
                    {leadStatusLabels[status]}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true, locale: ptBR })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => onSelectLead(lead)}>
                        <Eye className="h-4 w-4 mr-2" /> Ver detalhes
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onNewInteraction(lead.id)}>
                        <MessageSquare className="h-4 w-4 mr-2" /> Nova interação
                      </DropdownMenuItem>
                      {status !== "converted" && status !== "trial_scheduled" && (
                        <DropdownMenuItem onClick={() => onScheduleTrial(lead.id)}>
                          <CalendarCheck className="h-4 w-4 mr-2" /> Agendar trial
                        </DropdownMenuItem>
                      )}
                      {status !== "converted" && status !== "lost" && (
                        <DropdownMenuItem onClick={() => onConvert(lead.id)}>
                          <UserCheck className="h-4 w-4 mr-2" /> Converter em aluno
                        </DropdownMenuItem>
                      )}
                      {status !== "converted" && status !== "lost" && (
                        <DropdownMenuItem className="text-destructive" onClick={() => onMarkLost(lead.id)}>
                          <XCircle className="h-4 w-4 mr-2" /> Marcar perdido
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
