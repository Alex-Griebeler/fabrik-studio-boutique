import { useState, useMemo } from "react";
import { Plus, UserPlus, List, Columns3, Star, CalendarCheck, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeads, useConvertLead, useUpdateLeadStatus, type Lead, type LeadStatus } from "@/hooks/useLeads";
import { LeadFormDialog } from "@/components/leads/LeadFormDialog";
import { LeadKanban } from "@/components/leads/LeadKanban";
import { LeadTable } from "@/components/leads/LeadTable";
import { LeadDetailDialog } from "@/components/leads/LeadDetailDialog";
import { InteractionFormDialog } from "@/components/leads/InteractionFormDialog";
import { TrialScheduler } from "@/components/leads/TrialScheduler";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function Leads() {
  const [search, setSearch] = useState("");
  const { data: leads, isLoading } = useLeads({ search });
  const convertLead = useConvertLead();
  const updateStatus = useUpdateLeadStatus();

  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [interactionLeadId, setInteractionLeadId] = useState("");
  const [convertDialog, setConvertDialog] = useState<string | null>(null);
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialLeadId, setTrialLeadId] = useState("");
  const [lostDialog, setLostDialog] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState("");

  const kpis = useMemo(() => {
    if (!leads) return { total: 0, qualified: 0, trial: 0, conversion: "0%" };
    const total = leads.length;
    const qualified = leads.filter((l) => l.qualification_score >= 50).length;
    const trial = leads.filter((l) => l.status === "trial_scheduled").length;
    const converted = leads.filter((l) => l.status === "converted").length;
    const rate = total > 0 ? Math.round((converted / total) * 100) : 0;
    return { total, qualified, trial, conversion: `${rate}%` };
  }, [leads]);

  const handleSelectLead = (lead: Lead) => {
    setSelectedLead(lead);
    setDetailOpen(true);
  };

  const handleNewInteraction = (leadId: string) => {
    setInteractionLeadId(leadId);
    setInteractionOpen(true);
  };

  const handleScheduleTrial = (leadId: string) => {
    setTrialLeadId(leadId);
    setTrialOpen(true);
  };

  const handleConvert = () => {
    if (convertDialog) {
      convertLead.mutate(convertDialog);
      setConvertDialog(null);
      setDetailOpen(false);
    }
  };

  const handleMarkLost = () => {
    if (lostDialog && lostReason.trim()) {
      updateStatus.mutate({ id: lostDialog, status: "lost", lost_reason: lostReason });
      setLostDialog(null);
      setLostReason("");
      setDetailOpen(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Leads & CRM"
        description="Funil de vendas, follow-ups e conversão"
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo Lead
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <KPICard title="Total de Leads" value={String(kpis.total)} icon={UserPlus} />
        <KPICard title="Qualificados" value={String(kpis.qualified)} icon={Star} />
        <KPICard title="Trials Agendados" value={String(kpis.trial)} icon={CalendarCheck} />
        <KPICard title="Taxa de Conversão" value={kpis.conversion} icon={Columns3} />
      </div>

      {/* Search + View toggle */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button size="sm" variant={view === "kanban" ? "default" : "outline"} onClick={() => setView("kanban")}>
          <Columns3 className="h-4 w-4 mr-1" /> Kanban
        </Button>
        <Button size="sm" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")}>
          <List className="h-4 w-4 mr-1" /> Lista
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-[400px] w-full" />
      ) : view === "kanban" ? (
        <LeadKanban
          leads={leads ?? []}
          onSelectLead={handleSelectLead}
          onNewInteraction={handleNewInteraction}
        />
      ) : (
        <LeadTable
          leads={leads ?? []}
          onSelectLead={handleSelectLead}
          onNewInteraction={handleNewInteraction}
          onScheduleTrial={handleScheduleTrial}
          onConvert={(id) => setConvertDialog(id)}
          onMarkLost={(id) => setLostDialog(id)}
        />
      )}

      {/* Dialogs */}
      <LeadFormDialog open={formOpen} onOpenChange={setFormOpen} />

      <LeadDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        lead={selectedLead}
        onNewInteraction={() => {
          if (selectedLead) handleNewInteraction(selectedLead.id);
        }}
        onConvert={() => {
          if (selectedLead) setConvertDialog(selectedLead.id);
        }}
        onScheduleTrial={() => {
          if (selectedLead) handleScheduleTrial(selectedLead.id);
        }}
        onMarkLost={() => {
          if (selectedLead) setLostDialog(selectedLead.id);
        }}
      />

      <InteractionFormDialog
        open={interactionOpen}
        onOpenChange={setInteractionOpen}
        leadId={interactionLeadId}
      />

      <TrialScheduler
        open={trialOpen}
        onOpenChange={setTrialOpen}
        leadId={trialLeadId}
      />

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

      {/* Lost dialog */}
      <AlertDialog open={!!lostDialog} onOpenChange={() => { setLostDialog(null); setLostReason(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar Lead como Perdido</AlertDialogTitle>
            <AlertDialogDescription>Informe o motivo da perda deste lead.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label>Motivo *</Label>
            <Textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Ex: sem interesse, concorrência, preço..."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleMarkLost} disabled={!lostReason.trim()}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
