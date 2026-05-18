import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  TrendingDown,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  useChurnAlerts,
  churnConfidenceLabels,
  churnModeLabels,
  churnStatusLabels,
  type ChurnAlert,
  type ChurnAlertMode,
  type ChurnAlertStatus,
  type ChurnConfidence,
} from "@/hooks/useChurnAlerts";
import { useTrainers } from "@/hooks/useTrainers";

// ─────────── Formatters ───────────

function fmtShort(iso: string): string {
  return format(parseISO(iso), "dd/MM", { locale: ptBR });
}

function fmtAvg(n: number): string {
  return `${n.toFixed(1)}/sem`;
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function statusBadgeClass(status: ChurnAlertStatus): string {
  switch (status) {
    case "open":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "acknowledged":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "resolved":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "suppressed":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

function confidenceBadgeClass(c: ChurnConfidence): string {
  return c === "full"
    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
    : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
}

function dropClass(drop: number): string {
  if (drop >= 0.7) return "text-red-700 dark:text-red-400 font-semibold";
  if (drop >= 0.5) return "text-orange-700 dark:text-orange-400 font-medium";
  return "text-foreground";
}

const OPEN_STATUSES: ReadonlySet<ChurnAlertStatus> = new Set(["open"]);

export default function ChurnAlerts() {
  const [tab, setTab] = useState<"open" | "history">("open");
  const [confidenceFilter, setConfidenceFilter] = useState<
    ChurnConfidence | "all"
  >("all");
  const [modeFilter, setModeFilter] = useState<ChurnAlertMode | "all">("all");
  const [trainerFilter, setTrainerFilter] = useState<string>("all");

  // Fetch único (todos os status). Filtros aplicados client-side pra
  // os summary cards refletirem o universo completo e a tabela
  // reagir às tabs/filtros sem refetch.
  const { data: alerts, isLoading, error } = useChurnAlerts({});
  const { data: trainers } = useTrainers();

  const filtered = useMemo(() => {
    const list = alerts ?? [];
    return list.filter((a) => {
      const inTab =
        tab === "open" ? OPEN_STATUSES.has(a.status) : !OPEN_STATUSES.has(a.status);
      if (!inTab) return false;
      if (confidenceFilter !== "all" && a.confidence !== confidenceFilter) {
        return false;
      }
      if (modeFilter !== "all" && a.mode !== modeFilter) return false;
      if (trainerFilter !== "all" && a.trainer_id !== trainerFilter) return false;
      return true;
    });
  }, [alerts, tab, confidenceFilter, modeFilter, trainerFilter]);

  const summary = useMemo(() => {
    const list = alerts ?? [];
    const open = list.filter((a) => OPEN_STATUSES.has(a.status));
    const provisional = open.filter((a) => a.confidence === "provisional").length;
    const full = open.filter((a) => a.confidence === "full").length;
    const biggestDrop = open.reduce(
      (max, a) => (a.drop_pct > max ? a.drop_pct : max),
      0,
    );
    return {
      openTotal: open.length,
      provisional,
      full,
      biggestDrop: open.length > 0 ? biggestDrop : null,
    };
  }, [alerts]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertas de churn"
        description="Alunos com queda de frequência detectada pelo agente em modo shadow."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Abertos"
          value={summary.openTotal.toString()}
          tone={summary.openTotal > 0 ? "alert" : "neutral"}
        />
        <SummaryCard
          label="Provisional"
          value={summary.provisional.toString()}
          tone="muted"
          hint="Baseline curto — exige queda maior"
        />
        <SummaryCard
          label="Full"
          value={summary.full.toString()}
          tone={summary.full > 0 ? "alert" : "neutral"}
          hint="Baseline >= 4 semanas"
        />
        <SummaryCard
          label="Maior queda"
          value={summary.biggestDrop === null ? "—" : fmtPct(summary.biggestDrop)}
          tone={
            summary.biggestDrop !== null && summary.biggestDrop >= 0.7
              ? "alert"
              : "neutral"
          }
        />
      </div>

      {error && (
        <Card className="border-red-300 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10">
          <CardContent className="pt-6 text-sm text-red-700 dark:text-red-400">
            Erro ao carregar churn_alerts: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardContent className="pt-6 space-y-4">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as "open" | "history")}
          >
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
                  value={confidenceFilter}
                  onValueChange={(v) =>
                    setConfidenceFilter(v as ChurnConfidence | "all")
                  }
                >
                  <SelectTrigger className="h-9 w-[160px]">
                    <SelectValue placeholder="Confidence" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Confidence: todos</SelectItem>
                    <SelectItem value="full">Full</SelectItem>
                    <SelectItem value="provisional">Provisional</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={modeFilter}
                  onValueChange={(v) =>
                    setModeFilter(v as ChurnAlertMode | "all")
                  }
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
              <ChurnTable
                alerts={filtered}
                isLoading={isLoading}
                emptyMessage="Nenhum aluno em risco de churn no momento."
              />
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <ChurnTable
                alerts={filtered}
                isLoading={isLoading}
                emptyMessage="Sem histórico de churn ainda."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────── Subcomponents ───────────

interface SummaryCardProps {
  label: string;
  value: string;
  tone: "alert" | "neutral" | "muted";
  hint?: string;
}

function SummaryCard({ label, value, tone, hint }: SummaryCardProps) {
  const valueClass =
    tone === "alert"
      ? "text-red-700 dark:text-red-400"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <Card className="border-border/50">
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={`mt-1 text-2xl font-semibold ${valueClass}`}>
          {value}
        </div>
        {hint && (
          <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

interface ChurnTableProps {
  alerts: ChurnAlert[];
  isLoading: boolean;
  emptyMessage: string;
}

function ChurnTable({ alerts, isLoading, emptyMessage }: ChurnTableProps) {
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
        <TrendingDown className="h-10 w-10 mb-3 opacity-30" />
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
            <TableHead>Treinador</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead className="text-right">Recente</TableHead>
            <TableHead className="text-right">Baseline</TableHead>
            <TableHead className="text-right">Queda</TableHead>
            <TableHead>Semanas</TableHead>
            <TableHead>Janela</TableHead>
            <TableHead>Detectado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.map((a) => (
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
                {a.trainer?.full_name ?? "—"}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${statusBadgeClass(a.status)}`}
                >
                  {churnStatusLabels[a.status]}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${confidenceBadgeClass(a.confidence)}`}
                  >
                    {churnConfidenceLabels[a.confidence]}
                  </Badge>
                  {a.mode === "shadow" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      {churnModeLabels[a.mode]}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {fmtAvg(a.recent_weekly_avg)}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {fmtAvg(a.baseline_weekly_avg)}
              </TableCell>
              <TableCell
                className={`text-right text-sm tabular-nums ${dropClass(a.drop_pct)}`}
              >
                {fmtPct(a.drop_pct)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {a.recent_weeks_used} / {a.baseline_weeks_used}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {fmtShort(a.data_start)} → {fmtShort(a.data_end)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                <Clock className="h-3 w-3 inline mr-1 opacity-60" />
                {formatDistanceToNow(parseISO(a.detected_at), {
                  locale: ptBR,
                  addSuffix: false,
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
