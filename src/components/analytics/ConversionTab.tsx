import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/shared/KPICard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ResponsiveContainer, FunnelChart } from "recharts";
import { Users, UserCheck, Clock, UserX } from "lucide-react";
import type { ConversionFunnel } from "@/hooks/useAnalytics";

const FUNNEL_COLORS = [
  "hsl(210, 60%, 50%)",
  "hsl(270, 50%, 55%)",
  "hsl(152, 60%, 40%)",
  "hsl(0, 72%, 51%)",
];

interface Props {
  data: ConversionFunnel | undefined;
  isLoading: boolean;
}

export function ConversionTab({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const funnelData = [
    { name: "Leads", value: data.totalLeads },
    { name: "Aula Exp.", value: data.trialScheduled },
    { name: "Convertidos", value: data.converted },
  ];

  const conversionRate = data.totalLeads > 0
    ? Math.round((data.converted / data.totalLeads) * 100)
    : 0;

  const chartConfig = {
    count: { label: "Leads", color: "hsl(var(--primary))" },
    converted: { label: "Convertidos", color: "hsl(var(--success))" },
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Total Leads" value={String(data.totalLeads)} icon={Users} />
        <KPICard title="Aulas Experimentais" value={String(data.trialScheduled)} icon={Clock} />
        <KPICard
          title="Convertidos"
          value={String(data.converted)}
          icon={UserCheck}
          description={`${conversionRate}% conversão`}
        />
        <KPICard title="Perdidos" value={String(data.lost)} icon={UserX} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Funnel */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Funil de Conversão</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px]">
              <BarChart data={funnelData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {funnelData.map((_, i) => (
                    <Cell key={i} fill={FUNNEL_COLORS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            {data.avgConversionDays !== null && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Tempo médio de conversão: <span className="font-semibold">{data.avgConversionDays} dias</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* By Source */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Leads por Origem</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px]">
              <BarChart data={data.bySource.slice(0, 8)} margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="source" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" name="Total" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="converted" name="Convertidos" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
