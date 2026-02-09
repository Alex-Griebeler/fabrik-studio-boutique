import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

export default function Reports() {
  return (
    <div>
      <PageHeader title="Relatórios" description="KPIs, análises e previsões" />
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <BarChart3 className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm font-medium">Módulo de relatórios</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Indicadores e analytics</p>
      </div>
    </div>
  );
}
