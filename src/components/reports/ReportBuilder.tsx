import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, ChevronRight, ChevronLeft, BarChart3, PieChart, LineChart, Hash } from "lucide-react";
import { format } from "date-fns";

export type ReportMetric =
  | "total_leads" | "leads_marketing" | "leads_indicacao" | "total_experimentais"
  | "total_conversoes" | "taxa_conversao_leads" | "taxa_churn"
  | "faturamento" | "despesas" | "resultado" | "margem_lucro"
  | "total_sessoes" | "ocupacao" | "no_shows" | "cancelamentos_late"
  | "mrr" | "ltv" | "ticket_medio";

const metrics: Record<ReportMetric, { label: string; category: string }> = {
  total_leads: { label: "Total de Leads", category: "Leads" },
  leads_marketing: { label: "Leads Marketing", category: "Leads" },
  leads_indicacao: { label: "Leads Indicação", category: "Leads" },
  total_experimentais: { label: "Experimentais", category: "Operacional" },
  total_conversoes: { label: "Conversões", category: "Operacional" },
  taxa_conversao_leads: { label: "Taxa Conversão Leads", category: "Operacional" },
  total_sessoes: { label: "Total Sessões", category: "Operacional" },
  ocupacao: { label: "Taxa de Ocupação", category: "Operacional" },
  no_shows: { label: "No-Shows", category: "Operacional" },
  cancelamentos_late: { label: "Cancelamentos Tardios", category: "Operacional" },
  taxa_churn: { label: "Taxa Churn", category: "Financeiro" },
  faturamento: { label: "Faturamento", category: "Financeiro" },
  despesas: { label: "Despesas", category: "Financeiro" },
  resultado: { label: "Resultado", category: "Financeiro" },
  margem_lucro: { label: "Margem Lucro %", category: "Financeiro" },
  mrr: { label: "MRR", category: "Financeiro" },
  ltv: { label: "LTV Médio", category: "Financeiro" },
  ticket_medio: { label: "Ticket Médio", category: "Financeiro" },
};

type ChartType = "number" | "bar" | "line" | "pie";

const chartTypeIcons: Record<ChartType, typeof BarChart3> = {
  number: Hash,
  bar: BarChart3,
  line: LineChart,
  pie: PieChart,
};

const REPORT_TYPES = [
  { value: "conversion", label: "Conversão", description: "Funil de vendas, leads, trials" },
  { value: "operations", label: "Operações", description: "Sessões, ocupação, no-shows" },
  { value: "financial", label: "Financeiro", description: "Receita, churn, LTV" },
  { value: "custom", label: "Customizado", description: "Escolha suas métricas" },
] as const;

const PRESETS: Record<string, ReportMetric[]> = {
  conversion: ["total_leads", "leads_marketing", "leads_indicacao", "total_experimentais", "total_conversoes", "taxa_conversao_leads"],
  operations: ["total_sessoes", "ocupacao", "no_shows", "cancelamentos_late"],
  financial: ["faturamento", "despesas", "resultado", "margem_lucro", "mrr", "taxa_churn"],
  custom: [],
};

interface ReportConfig {
  name: string;
  type: string;
  metrics: ReportMetric[];
  chartTypes: Record<string, ChartType>;
  format: "pdf" | "excel";
  period: "month" | "quarter" | "year";
}

export function ReportBuilder() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<ReportConfig>({
    name: `Relatório ${format(new Date(), "dd/MM/yyyy")}`,
    type: "",
    metrics: [],
    chartTypes: {},
    format: "pdf",
    period: "month",
  });

  const [savedReports, setSavedReports] = useState<ReportConfig[]>(() => {
    const saved = localStorage.getItem("saved_reports_v2");
    return saved ? JSON.parse(saved) : [];
  });

  const totalSteps = config.type === "custom" ? 4 : 3;

  const handleSelectType = (type: string) => {
    const presetMetrics = PRESETS[type] ?? [];
    setConfig((prev) => ({
      ...prev,
      type,
      metrics: presetMetrics,
      chartTypes: Object.fromEntries(presetMetrics.map((m) => [m, "number" as ChartType])),
    }));
    setStep(type === "custom" ? 2 : 3);
  };

  const handleMetricToggle = (metric: ReportMetric) => {
    setConfig((prev) => {
      const has = prev.metrics.includes(metric);
      const newMetrics = has ? prev.metrics.filter((m) => m !== metric) : [...prev.metrics, metric];
      const newChartTypes = { ...prev.chartTypes };
      if (!has) newChartTypes[metric] = "number";
      else delete newChartTypes[metric];
      return { ...prev, metrics: newMetrics, chartTypes: newChartTypes };
    });
  };

  const handleChartTypeChange = (metric: string, type: ChartType) => {
    setConfig((prev) => ({ ...prev, chartTypes: { ...prev.chartTypes, [metric]: type } }));
  };

  const handleSave = () => {
    const newReports = [...savedReports, config];
    setSavedReports(newReports);
    localStorage.setItem("saved_reports_v2", JSON.stringify(newReports));
  };

  const handleExport = () => {
    console.log("Exporting report:", config);
    alert(`Relatório será exportado em ${config.format.toUpperCase()}`);
  };

  const handleReset = () => {
    setStep(1);
    setConfig({ name: `Relatório ${format(new Date(), "dd/MM/yyyy")}`, type: "", metrics: [], chartTypes: {}, format: "pdf", period: "month" });
  };

  const categories = Array.from(new Set(Object.values(metrics).map((m) => m.category)));

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) handleReset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-1" /> Construtor de Relatórios
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Construtor de Relatórios — Passo {step} de {totalSteps}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i + 1 <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        {/* STEP 1: Type */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Escolha o tipo de relatório:</p>
            <div className="grid grid-cols-2 gap-3">
              {REPORT_TYPES.map((t) => (
                <Card
                  key={t.value}
                  className={`cursor-pointer transition-all hover:border-primary/50 ${config.type === t.value ? "border-primary ring-1 ring-primary/20" : ""}`}
                  onClick={() => handleSelectType(t.value)}
                >
                  <CardContent className="p-4 space-y-1">
                    <p className="text-sm font-semibold">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Saved templates */}
            {savedReports.length > 0 && (
              <div className="pt-4 border-t">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Modelos Salvos</p>
                <div className="space-y-2">
                  {savedReports.map((r, idx) => (
                    <Card
                      key={idx}
                      className="p-3 cursor-pointer hover:bg-muted/50"
                      onClick={() => { setConfig(r); setStep(totalSteps); }}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium">{r.name}</p>
                          <p className="text-xs text-muted-foreground">{r.metrics.length} métricas · {r.type}</p>
                        </div>
                        <Badge variant="secondary">{r.format.toUpperCase()}</Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Metrics (custom only) */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Selecione as métricas para incluir:</p>
            {categories.map((category) => (
              <div key={category} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">{category}</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(metrics)
                    .filter(([, m]) => m.category === category)
                    .map(([key, m]) => (
                      <div key={key} className="flex items-center space-x-2">
                        <Checkbox
                          id={key}
                          checked={config.metrics.includes(key as ReportMetric)}
                          onCheckedChange={() => handleMetricToggle(key as ReportMetric)}
                        />
                        <Label htmlFor={key} className="text-sm cursor-pointer font-normal">{m.label}</Label>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* STEP 3 (custom) / STEP 3 (preset): Visualization */}
        {((config.type === "custom" && step === 3) || (config.type !== "custom" && step === 3)) && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Escolha a visualização para cada métrica:</p>
            <div className="space-y-3">
              {config.metrics.map((m) => (
                <div key={m} className="flex items-center justify-between py-2 border-b border-border/30">
                  <span className="text-sm font-medium">{metrics[m]?.label ?? m}</span>
                  <div className="flex gap-1">
                    {(["number", "bar", "line", "pie"] as ChartType[]).map((ct) => {
                      const Icon = chartTypeIcons[ct];
                      return (
                        <Button
                          key={ct}
                          variant={config.chartTypes[m] === ct ? "default" : "outline"}
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleChartTypeChange(m, ct)}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4 (custom) / STEP 3 continued: Export config */}
        {step === totalSteps && (
          <div className="space-y-5">
            {/* Name */}
            <div>
              <Label className="text-sm font-medium">Nome do Relatório</Label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => setConfig((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm mt-1"
              />
            </div>

            {/* Period */}
            <div>
              <Label className="text-sm font-medium mb-1 block">Período</Label>
              <Select value={config.period} onValueChange={(v: any) => setConfig((prev) => ({ ...prev, period: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mensal</SelectItem>
                  <SelectItem value="quarter">Trimestral</SelectItem>
                  <SelectItem value="year">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Format */}
            <div>
              <Label className="text-sm font-medium mb-1 block">Formato de Exportação</Label>
              <div className="flex gap-2">
                {(["pdf", "excel"] as const).map((fmt) => (
                  <Button
                    key={fmt}
                    variant={config.format === fmt ? "default" : "outline"}
                    size="sm"
                    onClick={() => setConfig((prev) => ({ ...prev, format: fmt }))}
                  >
                    {fmt.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="p-3 rounded-md bg-muted/50 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Resumo</p>
              <p className="text-sm">
                <span className="font-medium">{config.metrics.length}</span> métricas ·{" "}
                <span className="font-medium">{config.type}</span> ·{" "}
                <Badge variant="secondary" className="text-[10px]">{config.format.toUpperCase()}</Badge>
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSave} className="flex-1">
                Salvar Modelo
              </Button>
              <Button onClick={handleExport} className="flex-1">
                <Download className="h-4 w-4 mr-1" /> Exportar
              </Button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          {step < totalSteps && step > 1 && (
            <Button
              size="sm"
              onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
              disabled={config.metrics.length === 0}
            >
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
