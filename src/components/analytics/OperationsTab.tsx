import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/shared/KPICard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { CalendarDays, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { OperationsFilter, type OperationsFilters } from "./OperationsFilter";
import type { OperationsMetrics } from "@/hooks/useAnalytics";

const STATUS_COLORS = [
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(210, 60%, 50%)",
];

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface Props {
  data: OperationsMetrics | undefined;
  isLoading: boolean;
}

export function OperationsTab({ data, isLoading }: Props) {
  const [filters, setFilters] = useState<OperationsFilters>({});
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

  const pieData = [
    { name: "Realizadas", value: data.completedSessions },
    { name: "Canc. no prazo", value: data.cancelledOnTime },
    { name: "Canc. tardio", value: data.cancelledLate },
    { name: "No-show", value: data.noShows },
  ].filter((d) => d.value > 0);

  const noShowRate = data.totalSessions > 0
    ? Math.round((data.noShows / data.totalSessions) * 100)
    : 0;

  const lateCancelRate = data.totalSessions > 0
    ? Math.round((data.cancelledLate / data.totalSessions) * 100)
    : 0;

  // Heatmap: aggregate by day
  const byDay = new Map<number, number>();
  for (const h of data.heatmap) {
    byDay.set(h.day, (byDay.get(h.day) ?? 0) + h.count);
  }
  const dayData = DAY_LABELS.map((label, i) => ({ day: label, sessions: byDay.get(i) ?? 0 }));

  const chartConfig = {
    sessions: { label: "Sessões", color: "hsl(var(--primary))" },
  };

  return (
    <div className="space-y-6">
      <OperationsFilter filters={filters} onFiltersChange={setFilters} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Total Sessões" value={String(data.totalSessions)} icon={CalendarDays} />
        <KPICard
          title="Realizadas"
          value={String(data.completedSessions)}
          icon={CheckCircle}
          description={`${data.totalSessions > 0 ? Math.round((data.completedSessions / data.totalSessions) * 100) : 0}%`}
        />
        <KPICard
          title="No-Show"
          value={`${noShowRate}%`}
          icon={XCircle}
          description={`${data.noShows} sessões`}
        />
        <KPICard
          title="Canc. Tardio"
          value={`${lateCancelRate}%`}
          icon={AlertTriangle}
          description={`${data.cancelledLate} sessões`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Status breakdown */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Status das Sessões</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px]">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Sessions by day of week */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Sessões por Dia da Semana</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px]">
              <BarChart data={dayData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="sessions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
