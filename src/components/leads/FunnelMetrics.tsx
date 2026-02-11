import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/shared/KPICard";
import type { Lead } from "@/hooks/useLeads";
import { TrendingUp } from "lucide-react";

interface FunnelMetricsProps {
  leads: Lead[];
}

export function FunnelMetrics({ leads }: FunnelMetricsProps) {
  const metrics = useMemo(() => {
    const statusCounts = {
      new: leads.filter((l) => l.status === "new").length,
      contacted: leads.filter((l) => l.status === "contacted").length,
      qualified: leads.filter((l) => l.status === "qualified").length,
      trial_scheduled: leads.filter((l) => l.status === "trial_scheduled").length,
      converted: leads.filter((l) => l.status === "converted").length,
      lost: leads.filter((l) => l.status === "lost").length,
    };

    const total = leads.length;

    return {
      statusCounts,
      total,
      conversionRate: total > 0 ? Math.round((statusCounts.converted / total) * 100) : 0,
      trialRate: statusCounts.qualified > 0 ? Math.round((statusCounts.trial_scheduled / statusCounts.qualified) * 100) : 0,
      lossRate: total > 0 ? Math.round((statusCounts.lost / total) * 100) : 0,
      avgConversionDays: calculateAvgConversionDays(leads),
    };
  }, [leads]);

  return (
    <div className="space-y-6">
      {/* Funnel overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <KPICard
          title="Leads"
          value={String(metrics.statusCounts.new + metrics.statusCounts.contacted)}
          description="Entrada do funil"
          icon={TrendingUp}
        />
        <KPICard
          title="Qualificados"
          value={String(metrics.statusCounts.qualified)}
          description="Leads qualificados"
          icon={TrendingUp}
        />
        <KPICard
          title="Agendados"
          value={String(metrics.statusCounts.trial_scheduled)}
          description={`${metrics.trialRate}% dos qualificados`}
          icon={TrendingUp}
        />
        <KPICard
          title="Convertidos"
          value={String(metrics.statusCounts.converted)}
          description={`${metrics.conversionRate}% do total`}
          icon={TrendingUp}
        />
        <KPICard
          title="Perdidos"
          value={String(metrics.statusCounts.lost)}
          description={`${metrics.lossRate}% do total`}
          icon={TrendingUp}
        />
        <KPICard
          title="Taxa Geral"
          value={`${metrics.conversionRate}%`}
          description={`${metrics.statusCounts.converted}/${metrics.total}`}
          icon={TrendingUp}
        />
      </div>

      {/* Detailed funnel steps */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Fluxo do Funil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {/* Step 1: Leads → Contato */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">Leads → Contatados</span>
                  <span className="text-xs text-muted-foreground">
                    {metrics.statusCounts.contacted} leads
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{
                      width: `${metrics.statusCounts.new + metrics.statusCounts.contacted > 0
                        ? (metrics.statusCounts.contacted / (metrics.statusCounts.new + metrics.statusCounts.contacted)) * 100
                        : 0
                        }%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-xs font-semibold min-w-[40px] text-right">
                {metrics.statusCounts.new + metrics.statusCounts.contacted > 0
                  ? Math.round((metrics.statusCounts.contacted / (metrics.statusCounts.new + metrics.statusCounts.contacted)) * 100)
                  : 0}%
              </span>
            </div>

            {/* Step 2: Contatados → Qualificados */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">Contatados → Qualificados</span>
                  <span className="text-xs text-muted-foreground">
                    {metrics.statusCounts.qualified} leads
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{
                      width: `${metrics.statusCounts.contacted > 0
                        ? (metrics.statusCounts.qualified / metrics.statusCounts.contacted) * 100
                        : 0
                        }%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-xs font-semibold min-w-[40px] text-right">
                {metrics.statusCounts.contacted > 0
                  ? Math.round((metrics.statusCounts.qualified / metrics.statusCounts.contacted) * 100)
                  : 0}%
              </span>
            </div>

            {/* Step 3: Qualificados → Trial */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">Qualificados → Trial Agendado</span>
                  <span className="text-xs text-muted-foreground">
                    {metrics.statusCounts.trial_scheduled} leads
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all"
                    style={{
                      width: `${metrics.trialRate}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-xs font-semibold min-w-[40px] text-right">
                {metrics.trialRate}%
              </span>
            </div>

            {/* Step 4: Trial → Conversão */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">Trial → Convertidos</span>
                  <span className="text-xs text-muted-foreground">
                    {metrics.statusCounts.converted} leads
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-orange-500 h-2 rounded-full transition-all"
                    style={{
                      width: `${metrics.statusCounts.trial_scheduled > 0
                        ? (metrics.statusCounts.converted / metrics.statusCounts.trial_scheduled) * 100
                        : 0
                        }%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-xs font-semibold min-w-[40px] text-right">
                {metrics.statusCounts.trial_scheduled > 0
                  ? Math.round((metrics.statusCounts.converted / metrics.statusCounts.trial_scheduled) * 100)
                  : 0}%
              </span>
            </div>

            {/* Overall conversion */}
            <div className="border-t pt-3 mt-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-semibold">Conversão Geral</span>
                  <span className="text-xs text-muted-foreground">
                    {metrics.statusCounts.converted} / {metrics.total}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div
                    className="bg-primary h-3 rounded-full transition-all"
                    style={{
                      width: `${(metrics.statusCounts.converted / (metrics.total || 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-sm font-bold min-w-[45px] text-right">
                {metrics.conversionRate}%
              </span>
            </div>
          </div>

          {metrics.avgConversionDays > 0 && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              ⏱️ Tempo médio de conversão: <span className="font-semibold">{metrics.avgConversionDays} dias</span>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Helper function to calculate average conversion days
function calculateAvgConversionDays(leads: Lead[]): number {
  const convertedLeads = leads.filter((l) => l.status === "converted" && l.created_at && l.updated_at);
  if (convertedLeads.length === 0) return 0;

  const totalDays = convertedLeads.reduce((sum, lead) => {
    const createdDate = new Date(lead.created_at);
    const convertedDate = new Date(lead.updated_at);
    const days = Math.floor((convertedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    return sum + days;
  }, 0);

  return Math.round(totalDays / convertedLeads.length);
}
