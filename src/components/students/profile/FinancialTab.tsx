import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { invoiceStatusLabels, invoiceStatusColors } from "@/hooks/useInvoices";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatCurrency(cents: number | null): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

interface Invoice {
  id: string;
  status: "pending" | "paid" | "overdue" | "cancelled" | "scheduled";
  amount_cents: number;
  paid_amount_cents: number | null;
  due_date: string;
  payment_date: string | null;
  reference_month: string | null;
  payment_type?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
}

interface Props {
  invoices: Invoice[] | undefined;
}

export function FinancialTab({ invoices }: Props) {
  const totalPaid = invoices?.filter((i) => i.status === "paid").reduce((sum, i) => sum + (i.paid_amount_cents ?? i.amount_cents), 0) ?? 0;
  const totalPending = invoices?.filter((i) => i.status === "pending" || i.status === "overdue").reduce((sum, i) => sum + i.amount_cents, 0) ?? 0;
  const nextDue = invoices?.find((i) => i.status === "pending");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Total Pago</p>
            <p className="text-xl font-bold text-success">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Em Aberto</p>
            <p className="text-xl font-bold text-destructive">{formatCurrency(totalPending)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Próximo Vencimento</p>
            <p className="text-xl font-bold">
              {nextDue ? format(new Date(nextDue.due_date), "dd/MM/yyyy") : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mensalidades</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices && invoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês Ref.</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data Pgto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      {inv.reference_month
                        ? format(new Date(inv.reference_month), "MMM/yyyy", { locale: ptBR })
                        : "—"}
                    </TableCell>
                    <TableCell>{format(new Date(inv.due_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(inv.amount_cents)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusColors[inv.status]}`}>
                        {invoiceStatusLabels[inv.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {inv.payment_date ? format(new Date(inv.payment_date), "dd/MM/yyyy") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center py-8 text-sm text-muted-foreground/60">Nenhuma mensalidade registrada</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
