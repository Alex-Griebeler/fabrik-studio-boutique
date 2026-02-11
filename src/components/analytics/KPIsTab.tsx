import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useMonthlyKPIs, useRecalculateKPIs } from "@/hooks/useMonthlyKPIs";
import { format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(cents / 100);
}

function Variation({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  const pct = previous === 0 ? 100 : Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return <span className="flex items-center gap-0.5 text-green-600 text-xs"><TrendingUp className="h-3 w-3" />+{pct}%</span>;
  if (pct < 0) return <span className="flex items-center gap-0.5 text-red-600 text-xs"><TrendingDown className="h-3 w-3" />{pct}%</span>;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function KPIsTab() {
  const { data: kpis, isLoading } = useMonthlyKPIs(6);
  const recalculate = useRecalculateKPIs();

  const handleRecalculate = () => {
    const now = new Date();
    // Recalculate current and previous month
    recalculate.mutate(format(startOfMonth(now), "yyyy-MM-dd"));
    recalculate.mutate(format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd"));
  };

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  const sorted = [...(kpis ?? [])].sort((a, b) => b.competencia.localeCompare(a.competencia));
  const current = sorted[0];
  const previous = sorted[1];

  const rows = current ? [
    { label: "Total Leads", value: current.total_leads, prev: previous?.total_leads },
    { label: "Leads Marketing", value: current.leads_marketing, prev: previous?.leads_marketing },
    { label: "Leads Indicação", value: current.leads_indicacao, prev: previous?.leads_indicacao },
    { label: "Experimentais", value: current.total_experimentais, prev: previous?.total_experimentais },
    { label: "Conversões", value: current.total_conversoes, prev: previous?.total_conversoes },
    { label: "Taxa Conversão Leads", value: current.taxa_conversao_leads, prev: previous?.taxa_conversao_leads, suffix: "%" },
    { label: "Taxa Conv. Experimentais", value: current.taxa_conversao_experimentais, prev: previous?.taxa_conversao_experimentais, suffix: "%" },
    { label: "Cancelamentos", value: current.cancelamentos, prev: previous?.cancelamentos, inverted: true },
    { label: "Churn", value: current.taxa_churn, prev: previous?.taxa_churn, suffix: "%", inverted: true },
    { label: "Faturamento", value: current.faturamento_cents, prev: previous?.faturamento_cents, currency: true },
    { label: "Despesas", value: current.despesas_cents, prev: previous?.despesas_cents, currency: true, inverted: true },
    { label: "Resultado", value: current.resultado_cents, prev: previous?.resultado_cents, currency: true },
    { label: "Margem", value: current.margem_lucro_pct, prev: previous?.margem_lucro_pct, suffix: "%" },
    { label: "Total Alunos", value: current.total_alunos, prev: previous?.total_alunos },
    { label: "Alunos Novos", value: current.alunos_novos, prev: previous?.alunos_novos },
    { label: "Alunos Perdidos", value: current.alunos_perdidos, prev: previous?.alunos_perdidos, inverted: true },
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {current && (
            <Badge variant="outline" className="text-xs">
              Último cálculo: {format(new Date(current.calculado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleRecalculate} disabled={recalculate.isPending}>
          <RefreshCw className={`h-4 w-4 mr-1 ${recalculate.isPending ? "animate-spin" : ""}`} />
          Recalcular
        </Button>
      </div>

      {!current ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Nenhum KPI calculado ainda. Clique em "Recalcular" para gerar.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Comparativo: {format(new Date(current.competencia), "MMMM/yyyy", { locale: ptBR })}
              {previous && ` vs ${format(new Date(previous.competencia), "MMMM/yyyy", { locale: ptBR })}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {rows.map(({ label, value, prev, suffix, currency, inverted }) => (
                <div key={label} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      {currency ? formatCurrency(value) : `${value}${suffix ?? ""}`}
                    </span>
                    {prev !== undefined && <Variation current={inverted ? -value : value} previous={inverted ? -prev : prev} />}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
