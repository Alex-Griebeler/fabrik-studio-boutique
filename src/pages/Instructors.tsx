import { useState } from "react";
import { GraduationCap, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useTrainers } from "@/hooks/useTrainers";
import { TrainerCard } from "@/components/instructors/TrainerCard";
import { TrainerFormDialog } from "@/components/instructors/TrainerFormDialog";
import type { Trainer } from "@/hooks/schedule/types";

export default function Instructors() {
  const [showForm, setShowForm] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);
  const { data: trainers, isLoading } = useTrainers();

  const handleEdit = (t: Trainer) => {
    setEditingTrainer(t);
    setShowForm(true);
  };

  const handleClose = (open: boolean) => {
    if (!open) setEditingTrainer(null);
    setShowForm(open);
  };

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

      {isLoading ? (
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
      )}

      <TrainerFormDialog open={showForm} onOpenChange={handleClose} trainer={editingTrainer} />
    </div>
  );
}
