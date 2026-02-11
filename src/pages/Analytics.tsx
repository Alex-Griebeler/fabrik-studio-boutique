import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangeFilter } from "@/components/analytics/DateRangeFilter";
import { ConversionTab } from "@/components/analytics/ConversionTab";
import { OperationsTab } from "@/components/analytics/OperationsTab";
import { FinancialTab } from "@/components/analytics/FinancialTab";
import { KPIsTab } from "@/components/analytics/KPIsTab";
import { MonthlyKPIsTab } from "@/components/analytics/MonthlyKPIsTab";
import { CohortAnalysis } from "@/components/analytics/CohortAnalysis";
import { PredictionsTab } from "@/components/analytics/PredictionsTab";
import {
  useConversionAnalytics,
  useOperationsAnalytics,
  useFinancialAnalytics,
  type DateRange,
} from "@/hooks/useAnalytics";
import { startOfMonth, endOfMonth } from "date-fns";

export default function Analytics() {
  const [range, setRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const conversion = useConversionAnalytics(range);
  const operations = useOperationsAnalytics(range);
  const financial = useFinancialAnalytics(range);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Análise detalhada de conversão, operações e financeiro"
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      <Tabs defaultValue="conversion" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="conversion">Conversão</TabsTrigger>
          <TabsTrigger value="operations">Operações</TabsTrigger>
          <TabsTrigger value="financial">Financeiro</TabsTrigger>
          <TabsTrigger value="cohort">Cohort</TabsTrigger>
          <TabsTrigger value="predictions">Predições</TabsTrigger>
          <TabsTrigger value="kpis">KPIs</TabsTrigger>
          <TabsTrigger value="monthly_kpis">KPIs Mensais</TabsTrigger>
        </TabsList>

        <TabsContent value="conversion">
          <ConversionTab data={conversion.data} isLoading={conversion.isLoading} />
        </TabsContent>

        <TabsContent value="operations">
          <OperationsTab data={operations.data} isLoading={operations.isLoading} />
        </TabsContent>

        <TabsContent value="financial">
          <FinancialTab data={financial.data} isLoading={financial.isLoading} />
        </TabsContent>

        <TabsContent value="cohort">
          <CohortAnalysis />
        </TabsContent>

        <TabsContent value="predictions">
          <PredictionsTab />
        </TabsContent>

        <TabsContent value="kpis">
          <KPIsTab />
        </TabsContent>

        <TabsContent value="monthly_kpis">
          <MonthlyKPIsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
