import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Download } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type ReportMetric = 
  | "total_leads" | "leads_marketing" | "leads_indicacao" | "total_experimentais"
  | "total_conversoes" | "taxa_conversao_leads" | "taxa_churn"
  | "faturamento" | "despesas" | "resultado" | "margem_lucro";

const metrics: Record<ReportMetric, { label: string; category: string }> = {
  total_leads: { label: "Total de Leads", category: "Leads" },
  leads_marketing: { label: "Leads Marketing", category: "Leads" },
  leads_indicacao: { label: "Leads Indicação", category: "Leads" },
  total_experimentais: { label: "Experimentais", category: "Operacional" },
  total_conversoes: { label: "Conversões", category: "Operacional" },
  taxa_conversao_leads: { label: "Taxa Conversão Leads", category: "Operacional" },
  taxa_churn: { label: "Taxa Churn", category: "Operacional" },
  faturamento: { label: "Faturamento", category: "Financeiro" },
  despesas: { label: "Despesas", category: "Financeiro" },
  resultado: { label: "Resultado", category: "Financeiro" },
  margem_lucro: { label: "Margem Lucro %", category: "Financeiro" },
};

interface ReportConfig {
  name: string;
  metrics: ReportMetric[];
  format: "pdf" | "excel";
  period: "month" | "quarter" | "year";
  includeCharts: boolean;
}

export function ReportBuilder() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ReportConfig>({
    name: `Relatório ${format(new Date(), "dd/MM/yyyy")}`,
    metrics: ["total_leads", "total_conversoes", "faturamento"],
    format: "pdf",
    period: "month",
    includeCharts: true,
  });

  const [savedReports, setSavedReports] = useState<ReportConfig[]>(() => {
    const saved = localStorage.getItem("saved_reports");
    return saved ? JSON.parse(saved) : [];
  });

  const handleSaveTemplate = () => {
    const newReports = [...savedReports, config];
    setSavedReports(newReports);
    localStorage.setItem("saved_reports", JSON.stringify(newReports));
  };

  const handleLoadTemplate = (report: ReportConfig) => {
    setConfig(report);
  };

  const handleExport = async () => {
    // TODO: Integrate with PDF/Excel export API
    console.log("Exporting report:", config);
    alert(`Relatório será exportado em ${config.format.toUpperCase()}`);
  };

  const handleMetricToggle = (metric: ReportMetric) => {
    setConfig((prev) => ({
      ...prev,
      metrics: prev.metrics.includes(metric)
        ? prev.metrics.filter((m) => m !== metric)
        : [...prev.metrics, metric],
    }));
  };

  const categories = Array.from(new Set(Object.values(metrics).map((m) => m.category)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-1" /> Construtor de Relatórios
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Construtor de Relatórios Customizáveis</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Report Name */}
          <div>
            <Label className="text-sm font-medium">Nome do Relatório</Label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              placeholder="Ex: Relatório Mensal"
            />
          </div>

          {/* Period */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Período</Label>
            <Select value={config.period} onValueChange={(v: any) => setConfig((prev) => ({ ...prev, period: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mensal</SelectItem>
                <SelectItem value="quarter">Trimestral</SelectItem>
                <SelectItem value="year">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Metrics Selection */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Métricas para Incluir</Label>
            <div className="space-y-3">
              {categories.map((category) => (
                <div key={category} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">{category}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(metrics)
                      .filter(([, m]) => m.category === category)
                      .map(([key, m]) => (
                        <div key={key} className="flex items-center space-x-2">
                          <Checkbox
                            id={key}
                            checked={config.metrics.includes(key as ReportMetric)}
                            onCheckedChange={() => handleMetricToggle(key as ReportMetric)}
                          />
                          <Label htmlFor={key} className="text-sm cursor-pointer font-normal">
                            {m.label}
                          </Label>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Export Format */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Formato de Exportação</Label>
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

          {/* Include Charts */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="charts"
              checked={config.includeCharts}
              onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, includeCharts: checked as boolean }))}
            />
            <Label htmlFor="charts" className="text-sm cursor-pointer font-normal">
              Incluir gráficos no relatório
            </Label>
          </div>

          {/* Saved Templates */}
          {savedReports.length > 0 && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Modelos Salvos</Label>
              <div className="space-y-2">
                {savedReports.map((report, idx) => (
                  <Card key={idx} className="p-3 cursor-pointer hover:bg-muted/50" onClick={() => handleLoadTemplate(report)}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium">{report.name}</p>
                        <p className="text-xs text-muted-foreground">{report.metrics.length} métricas</p>
                      </div>
                      <Badge variant="secondary">{report.format.toUpperCase()}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={handleSaveTemplate} className="flex-1">
              Salvar Como Modelo
            </Button>
            <Button onClick={handleExport} className="flex-1">
              <Download className="h-4 w-4 mr-1" /> Exportar Relatório
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
