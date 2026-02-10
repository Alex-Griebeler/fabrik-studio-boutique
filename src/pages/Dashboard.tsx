import { Users, DollarSign, TrendingDown, CalendarDays, Phone, ArrowRight } from "lucide-react";
import { KPICard } from "@/components/shared/KPICard";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardKPIs, useUpcomingDues, useRecentLeads } from "@/hooks/useDashboard";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function calcTrend(current: number, previous: number) {
  if (previous === 0) return { value: current > 0 ? 100 : 0, direction: "up" as const };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { value: Math.abs(pct), direction: pct >= 0 ? "up" as const : "down" as const };
}

const leadStageLabels: Record<string, string> = {
  new: "Novo",
  contacted: "Contatado",
  trial: "Aula Exp.",
  negotiation: "Negociação",
};

const leadStageColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  contacted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  trial: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  negotiation: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: kpis, isLoading: kpisLoading } = useDashboardKPIs();
  const { data: upcomingDues, isLoading: duesLoading } = useUpcomingDues();
  const { data: recentLeads, isLoading: leadsLoading } = useRecentLeads();

  const revenueTrend = kpis ? calcTrend(kpis.revenue.current, kpis.revenue.previous) : undefined;
  const studentsTrend = kpis
    ? calcTrend(kpis.activeStudents.current, kpis.activeStudents.previous)
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Visão geral do seu studio" />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpisLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/50">
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KPICard
              title="Faturamento"
              value={formatCurrency(kpis?.revenue.current ?? 0)}
              icon={DollarSign}
              trend={revenueTrend}
              description="vs mês anterior"
            />
            <KPICard
              title="Alunos Ativos"
              value={String(kpis?.activeStudents.current ?? 0)}
              icon={Users}
              trend={studentsTrend}
              description="vs mês anterior"
            />
            <KPICard
              title="Inadimplência"
              value={formatCurrency(kpis?.overdue.amount ?? 0)}
              icon={TrendingDown}
              trend={
                kpis?.overdue.count
                  ? { value: kpis.overdue.count, direction: "down" as const }
                  : undefined
              }
              description={
                kpis?.overdue.count
                  ? `${kpis.overdue.count} fatura${kpis.overdue.count > 1 ? "s" : ""} vencida${kpis.overdue.count > 1 ? "s" : ""}`
                  : "Nenhuma fatura vencida"
              }
            />
            <KPICard
              title="Ocupação"
              value={`${kpis?.occupancy.rate ?? 0}%`}
              icon={CalendarDays}
              description={
                kpis?.occupancy.totalSlots
                  ? `${kpis.occupancy.totalBooked}/${kpis.occupancy.totalSlots} vagas`
                  : "Sem aulas no mês"
              }
            />
          </>
        )}
      </div>

      {/* Bottom cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming dues */}
        <Card className="border-border/50">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="font-display text-base font-semibold">
              Vencimentos Próximos
            </CardTitle>
            <button
              onClick={() => navigate("/finance")}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              Ver todos <ArrowRight className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent>
            {duesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !upcomingDues?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">Nenhum vencimento nos próximos 7 dias</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingDues.map((due) => (
                  <div
                    key={due.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{due.student_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Vence {format(parseISO(due.due_date), "dd/MM", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-sm font-semibold">{formatCurrency(due.amount_cents)}</p>
                      <Badge
                        variant="outline"
                        className={
                          due.status === "overdue"
                            ? "text-destructive border-destructive/30 text-[10px]"
                            : "text-yellow-600 border-yellow-400/30 text-[10px]"
                        }
                      >
                        {due.status === "overdue" ? "Vencido" : "Pendente"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent leads */}
        <Card className="border-border/50">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="font-display text-base font-semibold">
              Leads Recentes
            </CardTitle>
            <button
              onClick={() => navigate("/leads")}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              Ver todos <ArrowRight className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent>
            {leadsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !recentLeads?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">Nenhum lead registrado ainda</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{lead.full_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {lead.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {lead.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${leadStageColors[lead.lead_stage ?? "new"] ?? ""}`}
                    >
                      {leadStageLabels[lead.lead_stage ?? "new"] ?? lead.lead_stage ?? "Novo"}
                    </Badge>
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
