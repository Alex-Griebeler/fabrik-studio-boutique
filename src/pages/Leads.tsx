import { useState, useMemo } from "react";
import { Plus, UserPlus, List, Columns3 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeads, useConvertLeadToStudent, type LeadStage } from "@/hooks/useLeads";
import { useCreateStudent, useUpdateStudent, type Student, type StudentFormData } from "@/hooks/useStudents";
import { StudentFormDialog } from "@/components/students/StudentFormDialog";
import { LeadKanban } from "@/components/leads/LeadKanban";
import { LeadDetailDialog } from "@/components/leads/LeadDetailDialog";
import { InteractionFormDialog } from "@/components/leads/InteractionFormDialog";
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

export default function Leads() {
  const { data: leads, isLoading } = useLeads();
  const createStudent = useCreateStudent();
  const convertLead = useConvertLeadToStudent();

  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<(Student & { lead_stage: LeadStage }) | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [interactionLeadId, setInteractionLeadId] = useState("");
  const [convertDialog, setConvertDialog] = useState<string | null>(null);

  const kpis = useMemo(() => {
    if (!leads) return { total: 0, new: 0, contacted: 0, trial: 0, negotiation: 0 };
    return {
      total: leads.length,
      new: leads.filter((l) => !l.lead_stage || l.lead_stage === "new").length,
      contacted: leads.filter((l) => l.lead_stage === "contacted").length,
      trial: leads.filter((l) => l.lead_stage === "trial").length,
      negotiation: leads.filter((l) => l.lead_stage === "negotiation").length,
    };
  }, [leads]);

  const handleCreateLead = (data: StudentFormData) => {
    createStudent.mutate(
      { ...data, status: "lead" },
      { onSuccess: () => setFormOpen(false) }
    );
  };

  const handleSelectLead = (lead: Student & { lead_stage: LeadStage }) => {
    setSelectedLead(lead);
    setDetailOpen(true);
  };

  const handleNewInteraction = (leadId: string) => {
    setInteractionLeadId(leadId);
    setInteractionOpen(true);
  };

  const handleConvert = () => {
    if (convertDialog) {
      convertLead.mutate(convertDialog);
      setConvertDialog(null);
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
        <KPICard title="Novos" value={String(kpis.new)} icon={Plus} />
        <KPICard title="Em Negociação" value={String(kpis.negotiation)} icon={Columns3} />
        <KPICard title="Aula Experimental" value={String(kpis.trial)} icon={List} />
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2 mb-4">
        <Button
          size="sm"
          variant={view === "kanban" ? "default" : "outline"}
          onClick={() => setView("kanban")}
        >
          <Columns3 className="h-4 w-4 mr-1" /> Kanban
        </Button>
        <Button
          size="sm"
          variant={view === "list" ? "default" : "outline"}
          onClick={() => setView("list")}
        >
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
        // Simple list view fallback
        <div className="rounded-lg border bg-card divide-y divide-border">
          {!leads?.length ? (
            <div className="text-center text-muted-foreground py-12">
              <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum lead cadastrado</p>
            </div>
          ) : (
            leads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => handleSelectLead(lead)}
              >
                <div>
                  <p className="font-medium text-sm">{lead.full_name}</p>
                  <p className="text-xs text-muted-foreground">{lead.phone || lead.email || "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  {lead.lead_source && (
                    <span className="text-xs text-muted-foreground">{lead.lead_source}</span>
                  )}
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleNewInteraction(lead.id); }}>
                    Interação
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Dialogs */}
      <StudentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreateLead}
        isSubmitting={createStudent.isPending}
      />

      <LeadDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        lead={selectedLead}
        onNewInteraction={() => {
          if (selectedLead) {
            setInteractionLeadId(selectedLead.id);
            setInteractionOpen(true);
          }
        }}
        onConvert={() => {
          if (selectedLead) {
            setConvertDialog(selectedLead.id);
          }
        }}
      />

      <InteractionFormDialog
        open={interactionOpen}
        onOpenChange={setInteractionOpen}
        studentId={interactionLeadId}
      />

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
    </div>
  );
}
