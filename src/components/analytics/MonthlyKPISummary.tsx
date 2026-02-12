import { useMonthlyKPIs } from "@/hooks/useMonthlyKPIs";
import { KPICard } from "@/components/shared/KPICard";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Users, BarChart3, TrendingUpIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export function MonthlyKPISummary() {
  const { data: kpis, isLoading } = useMonthlyKPIs(2);

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="border-border/50">
            <div className="p-5">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-20" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  const sorted = [...(kpis ?? [])].sort((a, b) =>
    b.competencia.localeCompare(a.competencia)
  );
  const current = sorted[0];
  const previous = sorted[1];

  if (!current) {
    return null;
  }

  const calcTrend = (curr: number, prev: number | undefined) => {
    if (!prev || prev === 0) return undefined;
    const pct = Math.round(((curr - prev) / prev) * 100);
    return {
      value: Math.abs(pct),
      direction: pct >= 0 ? ("up" as const) : ("down" as const),
    };
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <KPICard
        title="Total Leads"
        value={String(current.total_leads)}
        icon={Users}
        trend={calcTrend(current.total_leads, previous?.total_leads)}
        description="leads do mês"
      />
      <KPICard
        title="Conversões"
        value={String(current.total_conversoes)}
        icon={TrendingUp}
        trend={calcTrend(current.total_conversoes, previous?.total_conversoes)}
        description={`${current.taxa_conversao_leads?.toFixed(1) || 0}% taxa`}
      />
      <KPICard
        title="Faturamento"
        value={formatCurrency(current.faturamento_cents)}
        icon={BarChart3}
        trend={calcTrend(
          current.faturamento_cents,
          previous?.faturamento_cents
        )}
        description="receita do mês"
      />
      <KPICard
        title="Margem"
        value={`${current.margem_lucro_pct?.toFixed(1) || 0}%`}
        icon={TrendingUpIcon}
        trend={calcTrend(current.margem_lucro_pct || 0, previous?.margem_lucro_pct)}
        description="lucro líquido"
      />
      <KPICard
        title="Churn"
        value={`${current.taxa_churn?.toFixed(1) || 0}%`}
        icon={TrendingDown}
        trend={calcTrend(current.taxa_churn || 0, previous?.taxa_churn)}
        description="cancelamentos"
      />
    </div>
  );
}
