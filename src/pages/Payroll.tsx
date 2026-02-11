import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageHeader } from "@/components/shared/PageHeader";
import { usePayrollSummary, useMarkSessionsPaid, type TrainerPayrollSummary } from "@/hooks/usePayroll";
import { useTrainers } from "@/hooks/useTrainers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { KPICard } from "@/components/shared/KPICard";
import { PayrollCyclesTab } from "@/components/payroll/PayrollCyclesTab";
import { PayrollDisputesTab } from "@/components/payroll/PayrollDisputesTab";
import { DollarSign, Clock, Users, ChevronDown, CheckCircle2, Banknote, Download } from "lucide-react";

function centsToReal(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function exportToCSV(summaries: TrainerPayrollSummary[], month: string) {
  const rows = [["Treinador", "Sessões", "Horas", "Valor Total", "Valor Pago", "A Pagar"]];
  
  summaries.forEach((summary) => {
    rows.push([
      summary.trainer_name,
      String(summary.total_sessions),
      String(summary.total_hours.toFixed(1)),
      centsToReal(summary.total_amount_cents),
      centsToReal(summary.paid_amount_cents),
      centsToReal(summary.unpaid_amount_cents),
    ]);
  });

  const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `payroll-${month}.csv`;
  link.click();
}

export default function Payroll() {
  const now = new Date();
  const [month, setMonth] = useState(() => format(now, "yyyy-MM"));
  const [trainerId, setTrainerId] = useState<string>("");
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const startDate = format(startOfMonth(new Date(month + "-01")), "yyyy-MM-dd");
  const endDate = format(endOfMonth(new Date(month + "-01")), "yyyy-MM-dd");

  const { data: summaries, isLoading } = usePayrollSummary({
    startDate,
    endDate,
    trainerId: trainerId || undefined,
    onlyUnpaid,
  });

  const { data: trainers } = useTrainers();
  const markPaid = useMarkSessionsPaid();

  const totals = useMemo(() => {
    if (!summaries) return { sessions: 0, hours: 0, total: 0, unpaid: 0 };
    return summaries.reduce(
      (acc, s) => ({
        sessions: acc.sessions + s.total_sessions,
        hours: acc.hours + s.total_hours,
        total: acc.total + s.total_amount_cents,
        unpaid: acc.unpaid + s.unpaid_amount_cents,
      }),
      { sessions: 0, hours: 0, total: 0, unpaid: 0 }
    );
  }, [summaries]);

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let i = -2; i <= 1; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push({
        value: format(d, "yyyy-MM"),
        label: format(d, "MMMM yyyy", { locale: ptBR }),
      });
    }
    return opts;
  }, []);

  const toggleSession = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllUnpaid = (summary: TrainerPayrollSummary) => {
    const unpaidIds = summary.sessions.filter((s) => !s.is_paid).map((s) => s.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = unpaidIds.every((id) => next.has(id));
      if (allSelected) {
        unpaidIds.forEach((id) => next.delete(id));
      } else {
        unpaidIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleMarkPaid = () => {
    if (selectedIds.size === 0) return;
    markPaid.mutate(Array.from(selectedIds), {
      onSuccess: () => setSelectedIds(new Set()),
    });
  };

  return (
    <div>
      <PageHeader
        title="Folha de Pagamento"
        description="Controle de pagamentos dos treinadores por período"
      />

      <Tabs defaultValue="sessions" className="mt-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="sessions">Sessões</TabsTrigger>
          <TabsTrigger value="cycles">Ciclos</TabsTrigger>
          <TabsTrigger value="disputes">Disputas</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-4 mb-6">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Período</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Treinador</Label>
              <Select value={trainerId || "all"} onValueChange={(v) => setTrainerId(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {trainers
                    ?.filter((t) => t.is_active)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pb-0.5">
              <Switch id="only-unpaid" checked={onlyUnpaid} onCheckedChange={setOnlyUnpaid} />
              <Label htmlFor="only-unpaid" className="text-sm">
                Apenas não pagas
              </Label>
            </div>

            {selectedIds.size > 0 && (
              <Button onClick={handleMarkPaid} disabled={markPaid.isPending} className="ml-auto">
                <Banknote className="h-4 w-4 mr-2" />
                Marcar {selectedIds.size} como paga{selectedIds.size > 1 ? "s" : ""}
              </Button>
            )}

            {summaries && summaries.length > 0 && (
              <Button 
                variant="outline" 
                onClick={() => exportToCSV(summaries, month)}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KPICard title="Sessões" value={String(totals.sessions)} icon={Clock} />
            <KPICard title="Horas" value={totals.hours.toFixed(1)} icon={Users} />
            <KPICard title="Total" value={centsToReal(totals.total)} icon={DollarSign} />
            <KPICard title="A pagar" value={centsToReal(totals.unpaid)} icon={Banknote} />
          </div>

          {/* Trainer summaries */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : !summaries?.length ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">Nenhuma sessão encontrada para este período</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {summaries.map((summary) => (
                <Collapsible key={summary.trainer_id}>
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                            <CardTitle className="text-base">{summary.trainer_name}</CardTitle>
                            <Badge variant="secondary" className="text-xs">
                              {summary.total_sessions} sessões
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            {summary.unpaid_count > 0 && (
                              <span className="text-destructive font-medium">
                                {centsToReal(summary.unpaid_amount_cents)} a pagar
                              </span>
                            )}
                            <span className="font-semibold">{centsToReal(summary.total_amount_cents)}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                selectAllUnpaid(summary);
                              }}
                              disabled={summary.unpaid_count === 0}
                            >
                              Selecionar pendentes
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10"></TableHead>
                              <TableHead>Data</TableHead>
                              <TableHead>Horário</TableHead>
                              <TableHead>Modalidade</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Aluno</TableHead>
                              <TableHead>Horas</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {summary.sessions.map((s) => (
                              <TableRow key={s.id} className={s.is_paid ? "opacity-60" : ""}>
                                <TableCell>
                                  {!s.is_paid && (
                                    <Checkbox
                                      checked={selectedIds.has(s.id)}
                                      onCheckedChange={() => toggleSession(s.id)}
                                    />
                                  )}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {format(new Date(s.session_date + "T12:00:00"), "dd/MM")}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                                </TableCell>
                                <TableCell className="text-sm">{s.modality}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {s.session_type}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm">{s.student_name ?? "—"}</TableCell>
                                <TableCell className="text-sm">{(s.payment_hours ?? 0).toFixed(1)}h</TableCell>
                                <TableCell className="text-right text-sm font-medium">
                                  {centsToReal(s.payment_amount_cents ?? 0)}
                                </TableCell>
                                <TableCell>
                                  {s.is_paid ? (
                                    <Badge className="bg-success/20 text-success border-success/30 text-xs">
                                      Pago
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-xs">
                                      Pendente
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cycles" className="py-6">
          <PayrollCyclesTab />
        </TabsContent>

        <TabsContent value="disputes" className="py-6">
          <PayrollDisputesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
