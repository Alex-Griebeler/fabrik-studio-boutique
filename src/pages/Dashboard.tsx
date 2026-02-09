import { Users, DollarSign, TrendingUp, CalendarDays } from "lucide-react";
import { KPICard } from "@/components/shared/KPICard";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Visão geral do seu studio" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Faturamento"
          value="R$ 112.450"
          icon={DollarSign}
          trend={{ value: 8, direction: "up" }}
          description="vs mês anterior"
        />
        <KPICard
          title="Alunos Ativos"
          value="118"
          icon={Users}
          trend={{ value: 5, direction: "up" }}
          description="vs mês anterior"
        />
        <KPICard
          title="Inadimplência"
          value="R$ 4.200"
          icon={TrendingUp}
          trend={{ value: 12, direction: "down" }}
          description="vs mês anterior"
        />
        <KPICard
          title="Ocupação"
          value="87%"
          icon={CalendarDays}
          trend={{ value: 2, direction: "up" }}
          description="vs mês anterior"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-semibold">Vencimentos Próximos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Nenhum vencimento nos próximos 7 dias</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-semibold">Leads Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Nenhum lead registrado ainda</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
