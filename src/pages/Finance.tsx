import { DollarSign } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

export default function Finance() {
  return (
    <div>
      <PageHeader title="Financeiro" description="Contas a receber, despesas e fluxo de caixa" />
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <DollarSign className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm font-medium">Módulo financeiro</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Será implementado com os dados do banco</p>
      </div>
    </div>
  );
}
