import { Settings } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Configurações" description="Planos, empresa, usuários e integrações" />
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <Settings className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm font-medium">Módulo de configurações</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Planos, preços e ajustes do sistema</p>
      </div>
    </div>
  );
}
