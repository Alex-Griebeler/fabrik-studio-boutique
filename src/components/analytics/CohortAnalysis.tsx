import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO, differenceInMonths, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

function getRetentionColor(rate: number) {
  if (rate >= 90) return "hsl(var(--success) / 0.9)";
  if (rate >= 75) return "hsl(var(--success) / 0.6)";
  if (rate >= 50) return "hsl(var(--warning) / 0.7)";
  if (rate >= 25) return "hsl(var(--destructive) / 0.5)";
  return "hsl(var(--destructive) / 0.8)";
}

interface CohortRow {
  cohortLabel: string;
  totalStudents: number;
  retention: (number | null)[]; // percentage per month offset
}

function useCohortData(months = 6) {
  return useQuery({
    queryKey: ["cohort-analysis", months],
    queryFn: async (): Promise<CohortRow[]> => {
      const { data: students } = await supabase
        .from("students")
        .select("id, created_at, status")
        .order("created_at", { ascending: true });

      const { data: contracts } = await supabase
        .from("contracts")
        .select("student_id, status, cancelled_at, start_date");

      if (!students || !contracts) return [];

      const now = new Date();
      const cohortMap = new Map<string, { studentIds: Set<string>; activeByMonth: Map<number, number> }>();

      // Group students by cohort month
      for (const s of students) {
        const cohortKey = s.created_at.substring(0, 7); // yyyy-MM
        if (!cohortMap.has(cohortKey)) {
          cohortMap.set(cohortKey, { studentIds: new Set(), activeByMonth: new Map() });
        }
        cohortMap.get(cohortKey)!.studentIds.add(s.id);
      }

      // For each student, determine when they churned
      const studentChurnMonth = new Map<string, number>(); // student_id -> months active
      for (const c of contracts) {
        if (c.status === "cancelled" && c.cancelled_at) {
          const cancelDate = parseISO(c.cancelled_at);
          const startDate = parseISO(c.start_date);
          const monthsActive = differenceInMonths(cancelDate, startDate);
          const existing = studentChurnMonth.get(c.student_id);
          if (existing === undefined || monthsActive > existing) {
            studentChurnMonth.set(c.student_id, monthsActive);
          }
        }
      }

      // Build cohort rows
      const cohortKeys = Array.from(cohortMap.keys()).sort().slice(-months);
      const maxOffset = months;

      const rows: CohortRow[] = [];
      for (const key of cohortKeys) {
        const cohort = cohortMap.get(key)!;
        const total = cohort.studentIds.size;
        if (total === 0) continue;

        const cohortDate = parseISO(key + "-01");
        const monthsSinceCohort = differenceInMonths(now, cohortDate);

        const retention: (number | null)[] = [];
        for (let offset = 0; offset <= Math.min(maxOffset - 1, monthsSinceCohort); offset++) {
          let activeCount = 0;
          for (const sid of cohort.studentIds) {
            const churnAt = studentChurnMonth.get(sid);
            if (churnAt === undefined || churnAt > offset) {
              activeCount++;
            }
          }
          retention.push(Math.round((activeCount / total) * 100));
        }
        // Fill remaining with null
        while (retention.length < maxOffset) {
          retention.push(null);
        }

        rows.push({
          cohortLabel: format(cohortDate, "MMM yy", { locale: ptBR }),
          totalStudents: total,
          retention,
        });
      }

      return rows;
    },
    staleTime: 300_000,
  });
}

export function CohortAnalysis() {
  const { data: cohorts, isLoading } = useCohortData(8);

  if (isLoading) {
    return <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>;
  }

  if (!cohorts || cohorts.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Dados insuficientes para análise de cohort.
        </CardContent>
      </Card>
    );
  }

  const maxOffset = cohorts.reduce((max, c) => Math.max(max, c.retention.filter((r) => r !== null).length), 0);
  const offsets = Array.from({ length: maxOffset }, (_, i) => i);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Análise de Cohort — Retenção de Alunos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <TooltipProvider>
            <table className="text-xs w-full">
              <thead>
                <tr>
                  <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">Cohort</th>
                  <th className="text-center py-1.5 px-2 font-semibold text-muted-foreground">Alunos</th>
                  {offsets.map((o) => (
                    <th key={o} className="text-center py-1.5 px-1 font-semibold text-muted-foreground min-w-[42px]">
                      M{o}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((row) => (
                  <tr key={row.cohortLabel}>
                    <td className="py-1 px-2 font-medium whitespace-nowrap">{row.cohortLabel}</td>
                    <td className="py-1 px-2 text-center text-muted-foreground">{row.totalStudents}</td>
                    {offsets.map((o) => {
                      const val = row.retention[o];
                      if (val === null) return <td key={o} className="py-1 px-1" />;
                      return (
                        <td key={o} className="py-1 px-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="rounded-sm text-center py-1 font-medium text-[10px]"
                                style={{
                                  backgroundColor: getRetentionColor(val),
                                  color: val >= 50 ? "white" : "hsl(var(--foreground))",
                                }}
                              >
                                {val}%
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {row.cohortLabel} — Mês {o}: {val}% retidos
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
