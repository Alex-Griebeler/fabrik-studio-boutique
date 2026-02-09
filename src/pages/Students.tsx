import { Users } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function Students() {
  return (
    <div>
      <PageHeader
        title="Alunos"
        description="Gerencie todos os alunos cadastrados"
        actions={
          <Button className="font-semibold">
            <Plus className="mr-2 h-4 w-4" />
            Novo Aluno
          </Button>
        }
      />
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <Users className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm font-medium">Nenhum aluno cadastrado</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Comece adicionando seu primeiro aluno</p>
      </div>
    </div>
  );
}
