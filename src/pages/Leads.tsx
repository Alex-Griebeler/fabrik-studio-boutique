import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function Leads() {
  return (
    <div>
      <PageHeader
        title="Leads"
        description="Funil de vendas e gestão de prospects"
        actions={
          <Button className="font-semibold">
            <Plus className="mr-2 h-4 w-4" />
            Novo Lead
          </Button>
        }
      />
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <UserPlus className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm font-medium">Nenhum lead registrado</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Cadastre seu primeiro lead</p>
      </div>
    </div>
  );
}
