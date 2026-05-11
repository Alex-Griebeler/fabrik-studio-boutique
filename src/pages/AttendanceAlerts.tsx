import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  MessageSquare,
  Send,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return format(parseISO(iso), "dd/MM HH:mm", { locale: ptBR });
}

function shortSid(sid: string | null): string {
  if (!sid) return "—";
  return sid.length <= 14 ? sid : `${sid.slice(0, 10)}…${sid.slice(-6)}`;
}

function deliveryLabel(a: AttendanceAlert): string {
  if (a.message_sid) return "Enviado ao provider";
  if (a.notified_at) return "Notificado";
  return "Aguardando envio";
}

function deliveryBadgeClass(a: AttendanceAlert): string {
  if (a.message_sid) {
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  }
  if (a.notified_at) {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  }
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
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
            <TableHead>Envio</TableHead>
            <TableHead>Aberto há</TableHead>
            <TableHead>Status</TableHead>
            {showActions && <TableHead className="w-[180px]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.map((a) => {
            const targetTrainer = a.escalated_to_trainer ?? a.trainer;
            return (
              <Fragment key={a.id}>
                <TableRow>
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
                  <TableCell className="text-sm">
                    <div className="flex flex-col gap-1">
                      <Badge
                        variant="outline"
                        className={`w-fit text-[10px] ${deliveryBadgeClass(a)}`}
                      >
                        {deliveryLabel(a)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {a.message_to ?? "sem destino"}
                      </span>
                    </div>
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
                <TableRow>
                  <TableCell colSpan={showActions ? 9 : 8} className="p-0">
                    <AlertAudit alert={a} />
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function AlertAudit({ alert }: { alert: AttendanceAlert }) {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value={`audit-${alert.id}`} className="border-0">
        <AccordionTrigger className="px-4 py-2 text-xs font-medium text-muted-foreground hover:no-underline">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            Auditoria do agente
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <div className="grid gap-3 rounded-md border bg-muted/30 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <AuditItem
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label="Destino"
              value={alert.message_to ?? "Ainda não enviado"}
            />
            <AuditItem
              icon={<Send className="h-3.5 w-3.5" />}
              label="SID Twilio"
              value={shortSid(alert.message_sid)}
              title={alert.message_sid ?? undefined}
            />
            <AuditItem
              label="Notificado em"
              value={fmtDateTime(alert.notified_at)}
            />
            <AuditItem
              label="Escalado em"
              value={fmtDateTime(alert.escalated_at)}
            />
            <AuditItem
              label="Criado em"
              value={fmtDateTime(alert.created_at)}
            />
            <AuditItem
              label="Detectado em"
              value={fmtDateTime(alert.detected_at)}
            />
            <AuditItem
              label="Escalação SID"
              value={shortSid(alert.escalation_message_sid)}
              title={alert.escalation_message_sid ?? undefined}
            />
            <AuditItem
              label="Ack"
              value={
                alert.acknowledged_at
                  ? `${fmtDateTime(alert.acknowledged_at)} (${alert.acknowledged_via ?? "—"})`
                  : "Pendente"
              }
            />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function AuditItem({
  icon,
  label,
  value,
  title,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="truncate font-medium text-foreground" title={title ?? value}>
        {value}
      </div>
    </div>
  );
}
