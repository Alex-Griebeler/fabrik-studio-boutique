import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, CheckCircle, Clock, Plus } from "lucide-react";
import { useCommissions, useCommissionSummary, useUpdateCommissionStatus } from "@/hooks/useCommissions";
import { CommissionFormDialog } from "@/components/commissions/CommissionFormDialog";
import { SalesTargetManager } from "@/components/commissions/SalesTargetManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const statusLabels: Record<string, string> = {
  calculada: "Calculada",
  aprovada: "Aprovada",
  paga: "Paga",
  cancelada: "Cancelada",
};

const statusColors: Record<string, string> = {
  calculada: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  aprovada: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  paga: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelada: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const tipoLabels: Record<string, string> = {
  venda_nova: "Venda Nova",
  renovacao: "Renovação",
  indicacao: "Indicação",
  meta: "Bônus Meta",
};

export default function Commissions() {
  const [showForm, setShowForm] = useState(false);
  const currentMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const { data: commissions, isLoading } = useCommissions();
  const { data: summary } = useCommissionSummary();
  const updateStatus = useUpdateCommissionStatus();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comissões"
        description="Gestão de comissões e metas de vendas"
        actions={
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Nova Comissão
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KPICard title="Total Gerado" value={formatCurrency(summary?.total ?? 0)} icon={DollarSign} />
        <KPICard title="Total Pago" value={formatCurrency(summary?.pago ?? 0)} icon={CheckCircle} />
        <KPICard title="Pendente" value={formatCurrency(summary?.pendente ?? 0)} icon={Clock} />
      </div>

      <Tabs defaultValue="commissions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="commissions">Comissões</TabsTrigger>
          <TabsTrigger value="targets">Metas</TabsTrigger>
        </TabsList>

        <TabsContent value="commissions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lista de Comissões</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : !commissions?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma comissão registrada</p>
              ) : (
                <div className="space-y-2">
                  {commissions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{(c.profiles as any)?.full_name ?? "—"}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{tipoLabels[c.tipo]}</span>
                          <span>•</span>
                          <span>{format(new Date(c.competencia), "MMM/yyyy", { locale: ptBR })}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-semibold">{formatCurrency(c.valor_comissao_cents)}</p>
                        <Select
                          value={c.status}
                          onValueChange={(v) => updateStatus.mutate({ id: c.id, status: v as any, data_pagamento: v === "paga" ? format(new Date(), "yyyy-MM-dd") : undefined })}
                        >
                          <SelectTrigger className="w-[120px] h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(statusLabels).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="targets">
          <SalesTargetManager />
        </TabsContent>
      </Tabs>

      <CommissionFormDialog open={showForm} onOpenChange={setShowForm} />
    </div>
  );
}
