import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import {
  useCurrentTrainerId,
  useTrainerPayrollSessions,
  useTrainerPayrollStats,
} from "@/hooks/useTrainerPayroll";
import { useCreatePayrollDispute } from "@/hooks/usePayrollDisputes";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Clock,
  CalendarDays,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

function centsToReal(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function TrainerPayroll() {
  const now = new Date();
  const { data: trainer, isLoading: trainerLoading } = useCurrentTrainerId();

  // Generate last 6 months as tabs
  const months = useMemo(() => {
    const result: { value: string; label: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = subMonths(now, i);
      result.push({
        value: format(d, "yyyy-MM"),
        label: format(d, "MMM yyyy", { locale: ptBR }),
      });
    }
    return result;
  }, []);

  const [activeMonth, setActiveMonth] = useState(months[0].value);

  const startDate = format(startOfMonth(new Date(activeMonth + "-01")), "yyyy-MM-dd");
  const endDate = format(endOfMonth(new Date(activeMonth + "-01")), "yyyy-MM-dd");

  const { data: sessions, isLoading: sessionsLoading } = useTrainerPayrollSessions({
    startDate,
    endDate,
    trainerId: trainer?.id,
  });

  const stats = useTrainerPayrollStats(sessions);

  // Previous month comparison
  const prevMonthStr = format(subMonths(new Date(activeMonth + "-01"), 1), "yyyy-MM");
  const prevStart = format(startOfMonth(new Date(prevMonthStr + "-01")), "yyyy-MM-dd");
  const prevEnd = format(endOfMonth(new Date(prevMonthStr + "-01")), "yyyy-MM-dd");
  const { data: prevSessions } = useTrainerPayrollSessions({
    startDate: prevStart,
    endDate: prevEnd,
    trainerId: trainer?.id,
  });
  const prevStats = useTrainerPayrollStats(prevSessions);

  // Dispute dialog
  const [disputeSession, setDisputeSession] = useState<{ id: string; date: string } | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDetail, setDisputeDetail] = useState("");
  const createDispute = useCreatePayrollDispute();

  const handleSubmitDispute = () => {
    if (!trainer || !disputeSession || !disputeReason.trim()) return;
    createDispute.mutate(
      {
        session_id: disputeSession.id,
        trainer_id: trainer.id,
        dispute_reason: disputeReason,
        dispute_detail: disputeDetail || null,
        status: "open" as const,
      },
      {
        onSuccess: () => {
          setDisputeSession(null);
          setDisputeReason("");
          setDisputeDetail("");
        },
      }
    );
  };

  if (trainerLoading) {
    return (
      <div>
        <PageHeader title="Minha Folha" description="Carregando..." />
        <div className="space-y-4 mt-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!trainer) {
    return (
      <div>
        <PageHeader title="Minha Folha" description="Visualize seus pagamentos e sessões" />
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Seu perfil não está vinculado a um treinador.</p>
            <p className="text-xs mt-1">Solicite ao administrador para vincular seu perfil.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const diff = (current: number, previous: number) => {
    if (previous === 0) return null;
    const pct = ((current - previous) / previous) * 100;
    return pct;
  };

  const amountDiff = diff(stats.totalAmountCents, prevStats.totalAmountCents);

  return (
    <div>
      <PageHeader
        title="Minha Folha"
        description={`Olá, ${trainer.full_name}. Veja seus pagamentos e sessões.`}
      />

      {/* Month selector */}
      <div className="mt-6">
        <Select value={activeMonth} onValueChange={setActiveMonth}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <KPICard
          title="Total a Receber"
          value={centsToReal(stats.unpaidAmountCents)}
          icon={DollarSign}
          trend={amountDiff !== null ? { value: Math.abs(Math.round(amountDiff)), direction: amountDiff >= 0 ? "up" : "down" } : undefined}
        />
        <KPICard title="Sessões Realizadas" value={String(stats.totalSessions)} icon={CalendarDays} />
        <KPICard title="Horas Trabalhadas" value={stats.totalHours.toFixed(1)} icon={Clock} />
        <KPICard title="Taxa Média/Hora" value={centsToReal(stats.avgRateCents)} icon={TrendingUp} />
      </div>

      {/* Payment status banner */}
      {stats.paidAmountCents > 0 && (
        <Card className="mt-4 border-success/30 bg-success/5">
          <CardContent className="flex items-center gap-3 py-3">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <span className="text-sm">
              <strong>{centsToReal(stats.paidAmountCents)}</strong> já pagos neste mês
            </span>
          </CardContent>
        </Card>
      )}

      {/* Sessions table */}
      <Card className="mt-6">
        <CardContent className="p-0">
          {sessionsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !sessions?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Nenhuma sessão neste período</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Modalidade</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id} className={s.is_paid ? "opacity-60" : ""}>
                    <TableCell className="text-sm">
                      {format(new Date(s.session_date + "T12:00:00"), "dd/MM", { locale: ptBR })}
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
                        <Badge className="bg-success/20 text-success border-success/30 text-xs">Pago</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!s.is_paid && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-destructive hover:text-destructive"
                          onClick={() => setDisputeSession({ id: s.id, date: s.session_date })}
                        >
                          Disputar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dispute dialog */}
      <Dialog open={!!disputeSession} onOpenChange={(open) => !open && setDisputeSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disputar Sessão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sessão de {disputeSession ? format(new Date(disputeSession.date + "T12:00:00"), "dd/MM/yyyy") : ""}
            </p>
            <div className="space-y-2">
              <Label>Motivo da disputa *</Label>
              <Select value={disputeReason} onValueChange={setDisputeReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="valor_incorreto">Valor incorreto</SelectItem>
                  <SelectItem value="sessao_nao_registrada">Sessão não registrada</SelectItem>
                  <SelectItem value="horas_incorretas">Horas incorretas</SelectItem>
                  <SelectItem value="tipo_sessao_errado">Tipo de sessão errado</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Detalhes (opcional)</Label>
              <Textarea
                value={disputeDetail}
                onChange={(e) => setDisputeDetail(e.target.value)}
                placeholder="Descreva o problema com mais detalhes..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeSession(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitDispute}
              disabled={!disputeReason || createDispute.isPending}
            >
              Enviar Disputa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
