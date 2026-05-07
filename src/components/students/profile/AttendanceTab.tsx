import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  alertTypeLabels,
  useOpenAttendanceAlertForStudent,
  useStudentAlertHistory,
} from "@/hooks/useAttendanceAlerts";

interface Booking {
  id: string;
  status: string;
  session?: {
    session_date?: string;
    start_time?: string;
    modality?: string;
    instructor?: { full_name?: string };
  };
}

interface Props {
  studentId?: string;
  bookings: Booking[] | undefined;
}

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

export function AttendanceTab({ studentId, bookings }: Props) {
  const { data: openAlert } = useOpenAttendanceAlertForStudent(studentId);
  const { data: alertHistory } = useStudentAlertHistory(studentId);

  const confirmedBookings = bookings?.filter((b) => b.status === "confirmed") ?? [];
  const historyCount = alertHistory?.length ?? 0;

  return (
    <div className="space-y-4">
      {openAlert && (
        <Card className="border-yellow-300/60 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-950/20">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-200">
                  🟡 Em risco — detectado em {fmtShort(openAlert.detected_at)}
                </p>
                <p className="text-sm text-yellow-900/80 dark:text-yellow-200/80 mt-1">
                  {alertTypeLabels[openAlert.alert_type]} · faltou{" "}
                  {joinDates(openAlert.missed_dates)}
                  {openAlert.last_attended_at && (
                    <> · última presença {fmtShort(openAlert.last_attended_at)}</>
                  )}
                </p>
                <Link
                  to="/alertas-faltas"
                  className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-yellow-900 dark:text-yellow-200 hover:underline"
                >
                  Ver alertas <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Total de Aulas</p>
            <p className="text-xl font-bold">{confirmedBookings.length}</p>
          </CardContent>
        </Card>
        {historyCount > 0 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Alertas anteriores</p>
              <p className="text-xl font-bold">{historyCount}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Últimas Aulas</CardTitle>
        </CardHeader>
        <CardContent>
          {confirmedBookings.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Modalidade</TableHead>
                  <TableHead>Instrutor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {confirmedBookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      {b.session?.session_date
                        ? format(new Date(b.session.session_date), "dd/MM/yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>{b.session?.start_time?.slice(0, 5) ?? "—"}</TableCell>
                    <TableCell>{b.session?.modality ?? "—"}</TableCell>
                    <TableCell>{b.session?.instructor?.full_name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center py-8 text-sm text-muted-foreground/60">
              Nenhuma presença registrada
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
