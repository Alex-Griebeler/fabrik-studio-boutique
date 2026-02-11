import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

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
  bookings: Booking[] | undefined;
}

export function AttendanceTab({ bookings }: Props) {
  const confirmedBookings = bookings?.filter((b) => b.status === "confirmed") ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Total de Aulas</p>
            <p className="text-xl font-bold">{confirmedBookings.length}</p>
          </CardContent>
        </Card>
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
            <p className="text-center py-8 text-sm text-muted-foreground/60">Nenhuma presença registrada</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
