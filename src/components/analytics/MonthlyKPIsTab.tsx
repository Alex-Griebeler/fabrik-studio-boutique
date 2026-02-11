import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMonthlyKPIs, useRecalculateKPIs, type MonthlyKPI } from "@/hooks/useMonthlyKPIs";
import { ArrowUp, ArrowDown, RotateCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function VariationIndicator({ current, previous }: { current: number; previous: number }) {
  const variation = previous ? ((current - previous) / previous) * 100 : 0;
  const isPositive = variation >= 0;

  if (!previous) return <span className="text-xs text-muted-foreground">-</span>;

  return (
    <div className="flex items-center gap-1">
      {isPositive ? (
        <ArrowUp className="w-3 h-3 text-success" />
      ) : (
        <ArrowDown className="w-3 h-3 text-destructive" />
      )}
      <span className={`text-xs font-medium ${isPositive ? "text-success" : "text-destructive"}`}>
        {Math.abs(variation).toFixed(1)}%
      </span>
    </div>
  );
}

function FormatCurrency(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function MonthlyKPIsTab() {
  const { data: kpis, isLoading } = useMonthlyKPIs(12);
  const recalculate = useRecalculateKPIs();

  const handleRecalculate = () => {
    // Recalculate current month
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    recalculate.mutate(date);
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Card>
    );
  }

  const sortedKPIs = kpis ? [...kpis].reverse() : [];

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Comparativo Mensal</h3>
        <Button
          size="sm"
          onClick={handleRecalculate}
          disabled={recalculate.isPending}
          className="gap-2"
        >
          <RotateCw className="w-4 h-4" />
          {recalculate.isPending ? "Recalculando..." : "Recalcular"}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="border-b">
              <TableHead className="font-semibold w-24">Mês</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Taxas %</TableHead>
              <TableHead className="text-right">Aulas Exp.</TableHead>
              <TableHead className="text-right">Conversões</TableHead>
              <TableHead className="text-right">Faturamento</TableHead>
              <TableHead className="text-right">Despesas</TableHead>
              <TableHead className="text-right">Resultado</TableHead>
              <TableHead className="text-right">Margem</TableHead>
              <TableHead className="text-right">Alunos</TableHead>
              <TableHead className="text-right">Churn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedKPIs.map((kpi, idx) => {
              const nextKpi = sortedKPIs[idx + 1];
              const competenciaDate = parseISO(kpi.competencia);

              return (
                <TableRow key={kpi.competencia} className="border-b hover:bg-muted/50">
                  <TableCell className="font-medium whitespace-nowrap">
                    {format(competenciaDate, "MMM yyyy", { locale: pt })}
                  </TableCell>

                  {/* Leads */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-medium">{kpi.total_leads}</span>
                      {nextKpi && (
                        <VariationIndicator current={kpi.total_leads} previous={nextKpi.total_leads} />
                      )}
                    </div>
                  </TableCell>

                  {/* Taxa Conversão Leads */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-medium">{kpi.taxa_conversao_leads?.toFixed(1) || "0"}%</span>
                      {nextKpi && (
                        <VariationIndicator
                          current={kpi.taxa_conversao_leads || 0}
                          previous={nextKpi.taxa_conversao_leads || 0}
                        />
                      )}
                    </div>
                  </TableCell>

                  {/* Experimentais */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-medium">{kpi.total_experimentais}</span>
                      {nextKpi && (
                        <VariationIndicator
                          current={kpi.total_experimentais}
                          previous={nextKpi.total_experimentais}
                        />
                      )}
                    </div>
                  </TableCell>

                  {/* Conversões */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-medium">{kpi.total_conversoes}</span>
                      {nextKpi && (
                        <VariationIndicator
                          current={kpi.total_conversoes}
                          previous={nextKpi.total_conversoes}
                        />
                      )}
                    </div>
                  </TableCell>

                  {/* Faturamento */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-medium text-success">
                        {FormatCurrency(kpi.faturamento_cents)}
                      </span>
                      {nextKpi && (
                        <VariationIndicator
                          current={kpi.faturamento_cents}
                          previous={nextKpi.faturamento_cents}
                        />
                      )}
                    </div>
                  </TableCell>

                  {/* Despesas */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-medium text-destructive">
                        {FormatCurrency(kpi.despesas_cents)}
                      </span>
                      {nextKpi && (
                        <VariationIndicator
                          current={kpi.despesas_cents}
                          previous={nextKpi.despesas_cents}
                        />
                      )}
                    </div>
                  </TableCell>

                  {/* Resultado */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={`font-semibold ${
                          kpi.resultado_cents >= 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {FormatCurrency(kpi.resultado_cents)}
                      </span>
                      {nextKpi && (
                        <VariationIndicator
                          current={kpi.resultado_cents}
                          previous={nextKpi.resultado_cents}
                        />
                      )}
                    </div>
                  </TableCell>

                  {/* Margem */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-medium">{kpi.margem_lucro_pct?.toFixed(1) || "0"}%</span>
                      {nextKpi && (
                        <VariationIndicator
                          current={kpi.margem_lucro_pct || 0}
                          previous={nextKpi.margem_lucro_pct || 0}
                        />
                      )}
                    </div>
                  </TableCell>

                  {/* Alunos */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-medium">{kpi.total_alunos}</span>
                      {nextKpi && (
                        <VariationIndicator current={kpi.total_alunos} previous={nextKpi.total_alunos} />
                      )}
                    </div>
                  </TableCell>

                  {/* Churn */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-medium">{kpi.taxa_churn?.toFixed(1) || "0"}%</span>
                      {nextKpi && (
                        <VariationIndicator
                          current={kpi.taxa_churn || 0}
                          previous={nextKpi.taxa_churn || 0}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {sortedKPIs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Nenhum KPI registrado ainda. Crie leads e conversões para gerar dados.
        </div>
      )}
    </Card>
  );
}
