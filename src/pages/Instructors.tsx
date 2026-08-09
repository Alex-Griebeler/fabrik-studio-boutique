import { useState } from "react";
import { GraduationCap, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTrainers } from "@/hooks/useTrainers";
import { useUserRoles } from "@/hooks/useUserRoles";
import { TrainerCard } from "@/components/instructors/TrainerCard";
import { TrainerFormDialog } from "@/components/instructors/TrainerFormDialog";
import { RatesTab } from "@/components/instructors/RatesTab";
import type { Trainer } from "@/hooks/schedule/types";

export default function Instructors() {
  const [showForm, setShowForm] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);
  const { data: trainers, isLoading } = useTrainers();
  const { roles, loading: rolesLoading, error: rolesError } = useUserRoles();
  // A aba Taxas é ADMIN-only: a RLS de trainer_service_rates não dá leitura
  // a manager — exibir a aba pra ele seria mostrar uma matriz sempre vazia.
  // Espera os papéis resolverem antes de decidir o layout: sem isso o admin
  // vê primeiro a versão sem aba e a tela "pisca" (lição do redirect 04/08).
  const isAdmin = roles.includes("admin");

  const handleEdit = (t: Trainer) => {
    setEditingTrainer(t);
    setShowForm(true);
  };

  const handleClose = (open: boolean) => {
    if (!open) setEditingTrainer(null);
    setShowForm(open);
  };

  const trainersGrid = isLoading ? (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <GraduationCap className="h-8 w-8 animate-pulse mr-2" />
      <span className="text-sm">Carregando treinadores...</span>
    </div>
  ) : !trainers?.length ? (
    <div className="text-center py-16 space-y-2">
      <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">Nenhum treinador cadastrado</p>
      <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
        <Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro treinador
      </Button>
    </div>
  ) : (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {trainers.map((t) => (
        <TrainerCard key={t.id} trainer={t} onEdit={handleEdit} />
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Treinadores"
        description="Gestão de treinadores, taxas e dados bancários"
        actions={
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo Treinador
          </Button>
        }
      />

      {rolesError && (
        <p className="mb-3 text-sm text-destructive">
          Não foi possível confirmar seu papel de acesso — a aba de taxas pode
          estar oculta indevidamente. Recarregue a página.
        </p>
      )}

      {rolesLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <GraduationCap className="h-8 w-8 animate-pulse mr-2" />
          <span className="text-sm">Carregando...</span>
        </div>
      ) : isAdmin ? (
        <Tabs defaultValue="trainers">
          <TabsList className="mb-4">
            <TabsTrigger value="trainers">Treinadores</TabsTrigger>
            <TabsTrigger value="rates">Pagamentos à equipe</TabsTrigger>
          </TabsList>
          <TabsContent value="trainers">{trainersGrid}</TabsContent>
          <TabsContent value="rates">
            <RatesTab isAdmin={isAdmin} />
          </TabsContent>
        </Tabs>
      ) : (
        trainersGrid
      )}

      <TrainerFormDialog open={showForm} onOpenChange={handleClose} trainer={editingTrainer} />
    </div>
  );
}
