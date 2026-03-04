import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/shared/KPICard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Clock,
} from "lucide-react";
import { useFinancialDashboard } from "@/hooks/useFinancialDashboard";
import { Badge } from "@/components/ui/badge";

function fmt(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const chartConfig = {
  revenue: { label: "Receita", color: "hsl(var(--success))" },
  expenses: { label: "Despesas", color: "hsl(var(--destructive))" },
  result: { label: "Resultado", color: "hsl(var(--primary))" },
  expectedIn: { label: "Entradas", color: "hsl(var(--success))" },
  expectedOut: { label: "Saídas", color: "hsl(var(--destructive))" },
  projected: { label: "Projeção", color: "hsl(var(--info))" },
  overdueAmount: { label: "Inadimplência", color: "hsl(var(--warning))" },
};

export function FinancialDashboard() {
  const { data, isLoading } = useFinancialDashboard();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-[280px] w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { currentMonth: cm, monthlySnapshots, cashFlowProjection } = data;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Receita do Mês"
          value={fmt(cm.revenue)}
          icon={DollarSign}
          description={
            cm.revenueChange !== 0
              ? `${cm.revenueChange > 0 ? "+" : ""}${cm.revenueChange}% vs mês anterior`
              : undefined
          }
        />
        <KPICard
          title="Despesas do Mês"
          value={fmt(cm.expenses)}
          icon={TrendingDown}
          description={
            cm.expenseChange !== 0
              ? `${cm.expenseChange > 0 ? "+" : ""}${cm.expenseChange}% vs mês anterior`
              : undefined
          }
        />
        <KPICard
          title="Resultado"
          value={fmt(cm.result)}
          icon={cm.result >= 0 ? TrendingUp : TrendingDown}
          description={cm.result >= 0 ? "Lucro" : "Prejuízo"}
        />
        <KPICard
          title="Inadimplência"
          value={`${cm.overdueCount} cobranças`}
          icon={AlertTriangle}
          description={cm.overdueAmount > 0 ? fmt(cm.overdueAmount) : "Nenhuma"}
        />
      </div>

      {/* Alerts */}
      {(cm.overdueCount > 0 || cm.pendingRevenue > 0) && (
        <div className="flex flex-wrap gap-3">
          {cm.overdueCount > 0 && (
            <Badge variant="destructive" className="gap-1.5 px-3 py-1.5 text-sm">
              <AlertTriangle className="h-3.5 w-3.5" />
              {cm.overdueCount} cobranças vencidas — {fmt(cm.overdueAmount)}
            </Badge>
          )}
          {cm.pendingRevenue > 0 && (
            <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm border-info/50 text-info">
              <Clock className="h-3.5 w-3.5" />
              {fmt(cm.pendingRevenue)} a receber este mês
            </Badge>
          )}
          {cm.revenueChange > 10 && (
            <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm border-success/50 text-success">
              <ArrowUpRight className="h-3.5 w-3.5" />
              Receita cresceu {cm.revenueChange}%
            </Badge>
          )}
          {cm.expenseChange > 20 && (
            <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm border-warning/50 text-warning">
              <ArrowDownRight className="h-3.5 w-3.5" />
              Despesas subiram {cm.expenseChange}%
            </Badge>
          )}
        </div>
      )}

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Revenue vs Expenses */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Receita × Despesas (6 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px]">
              <BarChart data={monthlySnapshots}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="revenue" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} name="Receita" />
                <Bar dataKey="expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Despesas" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Cash Flow Projection */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Projeção de Caixa (3 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            {cashFlowProjection.every((p) => p.expectedIn === 0 && p.expectedOut === 0) ? (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                Sem dados de projeção — cadastre cobranças e despesas futuras
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[280px]">
                <AreaChart data={cashFlowProjection}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Area
                    type="monotone"
                    dataKey="expectedIn"
                    stroke="hsl(var(--success))"
                    fill="hsl(var(--success))"
                    fillOpacity={0.15}
                    name="Entradas"
                  />
                  <Area
                    type="monotone"
                    dataKey="expectedOut"
                    stroke="hsl(var(--destructive))"
                    fill="hsl(var(--destructive))"
                    fillOpacity={0.15}
                    name="Saídas"
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delinquency trend */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Inadimplência por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[200px]">
            <BarChart data={monthlySnapshots}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="overdueAmount" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} name="Inadimplência" />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
