import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PoliciesEditor } from "@/components/settings/PoliciesEditor";
import { Settings, Sliders } from "lucide-react";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Configurações" description="Políticas, regras de negócio e ajustes do sistema" />

      <Tabs defaultValue="policies" className="mt-6">
        <TabsList>
          <TabsTrigger value="policies" className="gap-1.5">
            <Sliders className="h-4 w-4" />
            Políticas
          </TabsTrigger>
          <TabsTrigger value="general" className="gap-1.5">
            <Settings className="h-4 w-4" />
            Geral
          </TabsTrigger>
        </TabsList>

        <TabsContent value="policies">
          <PoliciesEditor />
        </TabsContent>

        <TabsContent value="general">
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Settings className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm font-medium">Em breve</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Configurações gerais do sistema</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
