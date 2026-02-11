import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, TrendingUp, Brain } from "lucide-react";

interface ChurnRiskStudent {
  id: string;
  name: string;
  riskLevel: "alto" | "médio" | "baixo";
  reasons: string[];
  missedSessions: number;
  daysSinceLastSession: number;
}

interface ConversionCandidate {
  id: string;
  name: string;
  score: number;
  source: string;
  daysSinceCreated: number;
}

function useChurnRisk() {
  return useQuery({
    queryKey: ["churn-risk-predictions"],
    queryFn: async (): Promise<ChurnRiskStudent[]> => {
      // Get active students with their recent session data
      const { data: students } = await supabase
        .from("students")
        .select("id, full_name, status")
        .eq("status", "active")
        .limit(2000);

      if (!students || students.length === 0) return [];

      const studentIds = students.map((s) => s.id);

      // Get recent sessions (last 60 days)
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data: sessions } = await supabase
        .from("sessions")
        .select("student_id, session_date, status")
        .in("student_id", studentIds)
        .gte("session_date", sixtyDaysAgo.toISOString().split("T")[0])
        .limit(10000);

      // Get overdue invoices
      const { data: overdueInvoices } = await supabase
        .from("invoices")
        .select("student_id")
        .eq("status", "overdue")
        .limit(5000);

      const overdueSet = new Set((overdueInvoices ?? []).map((i) => i.student_id));

      // Analyze risk per student
      const results: ChurnRiskStudent[] = [];
      const now = new Date();

      for (const student of students) {
        const studentSessions = (sessions ?? []).filter((s) => s.student_id === student.id);
        const noShows = studentSessions.filter((s) => s.status === "no_show").length;
        const cancelled = studentSessions.filter((s) => ["cancelled_late", "cancelled_on_time"].includes(s.status)).length;
        const completed = studentSessions.filter((s) => s.status === "completed");

        let daysSinceLastSession = 999;
        if (completed.length > 0) {
          const lastDate = completed.sort((a, b) => b.session_date.localeCompare(a.session_date))[0].session_date;
          daysSinceLastSession = Math.floor((now.getTime() - new Date(lastDate).getTime()) / 86400000);
        }

        const reasons: string[] = [];
        let riskScore = 0;

        if (daysSinceLastSession > 14) { reasons.push(`${daysSinceLastSession}d sem treinar`); riskScore += 3; }
        if (noShows > 2) { reasons.push(`${noShows} no-shows`); riskScore += 2; }
        if (cancelled > 3) { reasons.push(`${cancelled} cancelamentos`); riskScore += 2; }
        if (overdueSet.has(student.id)) { reasons.push("Fatura vencida"); riskScore += 3; }
        if (completed.length < 4) { reasons.push("Baixa frequência"); riskScore += 1; }

        if (riskScore >= 3) {
          results.push({
            id: student.id,
            name: student.full_name,
            riskLevel: riskScore >= 6 ? "alto" : riskScore >= 4 ? "médio" : "baixo",
            reasons,
            missedSessions: noShows + cancelled,
            daysSinceLastSession,
          });
        }
      }

      return results.sort((a, b) => {
        const order = { alto: 0, médio: 1, baixo: 2 };
        return order[a.riskLevel] - order[b.riskLevel];
      }).slice(0, 10);
    },
    staleTime: 300_000,
  });
}

function useHighConversionLeads() {
  return useQuery({
    queryKey: ["high-conversion-leads"],
    queryFn: async (): Promise<ConversionCandidate[]> => {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, name, qualification_score, source, created_at, status")
        .in("status", ["new", "contacted", "qualified", "trial_scheduled"])
        .order("qualification_score", { ascending: false })
        .limit(10);

      const now = new Date();
      return (leads ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        score: l.qualification_score,
        source: l.source ?? "Direto",
        daysSinceCreated: Math.floor((now.getTime() - new Date(l.created_at).getTime()) / 86400000),
      }));
    },
    staleTime: 300_000,
  });
}

export function PredictionsTab() {
  const churnRisk = useChurnRisk();
  const conversionLeads = useHighConversionLeads();

  const isLoading = churnRisk.isLoading || conversionLeads.isLoading;

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Brain className="h-4 w-4" />
        <span className="text-xs">Predições baseadas em padrões de comportamento dos últimos 60 dias</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Churn Risk */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Risco de Churn — Top 10
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(churnRisk.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum aluno com risco identificado 🎉</p>
            ) : (
              <div className="space-y-3">
                {(churnRisk.data ?? []).map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-2 py-2 border-b border-border/30 last:border-0">
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <div className="flex flex-wrap gap-1">
                        {s.reasons.map((r) => (
                          <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r}</span>
                        ))}
                      </div>
                    </div>
                    <Badge
                      variant={s.riskLevel === "alto" ? "destructive" : s.riskLevel === "médio" ? "secondary" : "outline"}
                      className="text-[10px] shrink-0"
                    >
                      {s.riskLevel}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* High conversion leads */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              Leads com Alta Probabilidade de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(conversionLeads.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum lead ativo no pipeline</p>
            ) : (
              <div className="space-y-3">
                {(conversionLeads.data ?? []).map((l) => (
                  <div key={l.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-medium truncate">{l.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {l.source} · {l.daysSinceCreated}d atrás
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border-2"
                        style={{
                          borderColor: l.score >= 70 ? "hsl(var(--success))" : l.score >= 40 ? "hsl(var(--warning))" : "hsl(var(--muted))",
                          color: l.score >= 70 ? "hsl(var(--success))" : l.score >= 40 ? "hsl(var(--warning))" : "hsl(var(--muted-foreground))",
                        }}
                      >
                        {l.score}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
