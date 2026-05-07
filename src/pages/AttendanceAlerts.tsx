import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Clock, Filter } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAcknowledgeAttendanceAlert,
  useAttendanceAlerts,
  useResolveAttendanceAlert,
  alertModeLabels,
  alertStatusLabels,
  alertTypeLabels,
  type AttendanceAlert,
  type AttendanceAlertMode,
  type AttendanceAlertStatus,
} from "@/hooks/useAttendanceAlerts";
import { useTrainers } from "@/hooks/useTrainers";

function fmtShort(iso: string): string {
  return format(parseISO(iso), "dd/MM", { locale: ptBR });
}

function joinDates(dates: string[]): string {
  if (!dates.length) return "—";
  if (dates.length === 1) return fmtShort(dates[0]);
  if (dates.length === 2) return `${fmtShort(dates[0])} e ${fmtShort(dates[1])}`;
  const head = dates.slice(0, -1).map(fmtShort).join(", ");
  return `${head} e ${fmtShort(dates[dates.length - 1])}`;
}

function statusBadgeClass(status: AttendanceAlertStatus): string {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "escalated":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "acknowledged":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "resolved":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "suppressed":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

export default function AttendanceAlerts() {
  const [tab, setTab] = useState<"open" | "history">("open");
  const [modeFilter, setModeFilter] = useState<AttendanceAlertMode | "all">("all");
  const [trainerFilter, setTrainerFilter] = useState<string>("all");

  const statusForQuery = tab === "open" ? "open" : "all";

  const { data: alerts, isLoading } = useAttendanceAlerts({
    status: statusForQuery,
    mode: modeFilter,
    trainerId: trainerFilter,
  });
  const { data: trainers } = useTrainers();

  const ack = useAcknowledgeAttendanceAlert();
  const resolveMut = useResolveAttendanceAlert();

  const filtered = useMemo(() => {
    if (!alerts) return [];
    if (tab === "history") {
      // Quando está na aba histórico, filtra fora os abertos
      return alerts.filter(
        (a) => a.status !== "pending" && a.status !== "escalated",
      );
    }
    return alerts;
  }, [alerts, tab]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertas de faltas"
        description="Alunos detectados em risco pelo agente automático. O treinador recebe via WhatsApp; aqui você acompanha e marca manualmente quando precisar."
      />

      <Card className="border-border/50">
        <CardContent className="pt-6 space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "open" | "history")}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <TabsList>
                <TabsTrigger value="open" className="gap-2">
                  <AlertTriangle className="h-4 w-4" /> Abertos
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Histórico
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={modeFilter}
                  onValueChange={(v) => setModeFilter(v as AttendanceAlertMode | "all")}
                >
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue placeholder="Modo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Modo: todos</SelectItem>
                    <SelectItem value="shadow">Shadow</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={trainerFilter} onValueChange={setTrainerFilter}>
                  <SelectTrigger className="h-9 w-[200px]">
                    <SelectValue placeholder="Treinador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Treinador: todos</SelectItem>
                    {(trainers ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TabsContent value="open" className="mt-4">
              <AlertsTable
                alerts={filtered}
                isLoading={isLoading}
                emptyMessage="Nenhum aluno em risco no momento."
                showActions
                onAck={(id) => ack.mutate(id)}
                onResolve={(id) => resolveMut.mutate(id)}
                ackPending={ack.isPending}
                resolvePending={resolveMut.isPending}
              />
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <AlertsTable
                alerts={filtered}
                isLoading={isLoading}
                emptyMessage="Sem histórico ainda."
                showActions={false}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

interface AlertsTableProps {
  alerts: AttendanceAlert[];
  isLoading: boolean;
  emptyMessage: string;
  showActions: boolean;
  onAck?: (id: string) => void;
  onResolve?: (id: string) => void;
  ackPending?: boolean;
  resolvePending?: boolean;
}

function AlertsTable({
  alerts,
  isLoading,
  emptyMessage,
  showActions,
  onAck,
  onResolve,
  ackPending,
  resolvePending,
}: AlertsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!alerts.length) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <CheckCircle2 className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Aluno</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Faltou</TableHead>
            <TableHead>Última presença</TableHead>
            <TableHead>Treinador alvo</TableHead>
            <TableHead>Aberto há</TableHead>
            <TableHead>Status</TableHead>
            {showActions && <TableHead className="w-[180px]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.map((a) => {
            const targetTrainer = a.escalated_to_trainer ?? a.trainer;
            return (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  {a.student ? (
                    <Link
                      to={`/students/${a.student.id}`}
                      className="hover:underline"
                    >
                      {a.student.full_name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {alertTypeLabels[a.alert_type]}
                  {a.mode === "shadow" && (
                    <Badge
                      variant="outline"
                      className="ml-2 text-[10px] uppercase tracking-wide"
                    >
                      {alertModeLabels[a.mode]}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {joinDates(a.missed_dates)}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {a.last_attended_at ? fmtShort(a.last_attended_at) : "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {targetTrainer?.full_name ?? "—"}
                  {a.escalated_to_trainer_id && (
                    <Badge
                      variant="outline"
                      className="ml-2 text-[10px] text-red-700 border-red-300"
                    >
                      escalado
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  <Clock className="h-3 w-3 inline mr-1 opacity-60" />
                  {formatDistanceToNow(parseISO(a.detected_at), {
                    locale: ptBR,
                    addSuffix: false,
                  })}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${statusBadgeClass(a.status)}`}
                  >
                    {alertStatusLabels[a.status]}
                  </Badge>
                </TableCell>
                {showActions && (
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ackPending}
                        onClick={() => onAck?.(a.id)}
                      >
                        Tratado
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={resolvePending}
                        onClick={() => onResolve?.(a.id)}
                      >
                        Resolver
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
