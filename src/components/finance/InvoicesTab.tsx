import { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { invoiceStatusLabels, invoiceStatusColors, paymentTypeLabels, type Invoice } from "@/hooks/useInvoices";
import { formatCents } from "@/hooks/usePlans";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";

type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

function formatDate(d: string | null) {
  if (!d) return "—";
  return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

interface Props {
  invoices: Invoice[] | undefined;
  isLoading: boolean;
  onEdit: (invoice: Invoice) => void;
}

export function InvoicesTab({ invoices, isLoading, onEdit }: Props) {
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | string>("all");
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);

  const filtered = useMemo(() => {
    return invoices?.filter((i) => {
      const d = new Date(i.due_date + "T00:00:00");
      if (d < monthStart || d > monthEnd) return false;
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (typeFilter !== "all" && i.payment_type !== typeFilter) return false;
      if (search.trim() && !i.student?.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [invoices, monthStart, monthEnd, statusFilter, typeFilter, search]);

  const monthKpis = useMemo(() => {
    if (!filtered) return { total: 0, paid: 0, pending: 0, overdue: 0, fines: 0 };
    const total = filtered.reduce((s, i) => s + i.amount_cents, 0);
    const paid = filtered.filter((i) => i.status === "paid").reduce((s, i) => s + (i.paid_amount_cents || i.amount_cents), 0);
    const pending = filtered.filter((i) => i.status === "pending" || i.status === "scheduled").length;
    const overdue = filtered.filter((i) => i.status === "overdue").length;
    const fines = filtered.reduce((s, i) => s + (i.fine_amount_cents || 0) + (i.interest_amount_cents || 0), 0);
    return { total, paid, pending, overdue, fines };
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setSelectedMonth((m) => subMonths(m, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-semibold min-w-[160px] text-center capitalize">
          {format(selectedMonth, "MMMM yyyy", { locale: ptBR })}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setSelectedMonth((m) => addMonths(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* Month KPIs inline */}
        <div className="ml-auto flex gap-4 text-sm">
          <span className="text-muted-foreground">Total: <strong className="text-foreground">{formatCents(monthKpis.total)}</strong></span>
          <span className="text-muted-foreground">Recebido: <strong className="text-green-600">{formatCents(monthKpis.paid)}</strong></span>
          {monthKpis.pending > 0 && <span className="text-muted-foreground">Pendentes: <strong className="text-yellow-600">{monthKpis.pending}</strong></span>}
          {monthKpis.overdue > 0 && <span className="text-muted-foreground">Vencidas: <strong className="text-destructive">{monthKpis.overdue}</strong></span>}
          {monthKpis.fines > 0 && <span className="text-muted-foreground">Multa/Juros: <strong className="text-destructive">{formatCents(monthKpis.fines)}</strong></span>}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por aluno..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | InvoiceStatus)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="scheduled">Agendadas</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="paid">Pagos</SelectItem>
              <SelectItem value="overdue">Vencidos</SelectItem>
              <SelectItem value="cancelled">Cancelados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Tipos</SelectItem>
              <SelectItem value="dcc">DCC</SelectItem>
              <SelectItem value="card_machine">Máquina</SelectItem>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="cash">Dinheiro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aluno</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Parcela</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Multa/Juros</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))
            ) : !filtered?.length ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhuma cobrança encontrada neste mês</TableCell></TableRow>
            ) : (
              filtered.map((inv) => {
                const penalties = (inv.fine_amount_cents || 0) + (inv.interest_amount_cents || 0);
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.student?.full_name || "—"}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {inv.payment_type ? paymentTypeLabels[inv.payment_type] || inv.payment_type : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {inv.installment_number && inv.total_installments
                        ? `${inv.installment_number}/${inv.total_installments}`
                        : "—"}
                    </TableCell>
                    <TableCell>{formatCents(inv.amount_cents)}</TableCell>
                    <TableCell>
                      {penalties > 0 ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-destructive font-medium">{formatCents(penalties)}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {(inv.fine_amount_cents || 0) > 0 && <div>Multa: {formatCents(inv.fine_amount_cents || 0)}</div>}
                              {(inv.interest_amount_cents || 0) > 0 && <div>Juros: {formatCents(inv.interest_amount_cents || 0)}</div>}
                              <div className="font-semibold border-t mt-1 pt-1">Total: {formatCents(inv.amount_cents + penalties)}</div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(inv.due_date)}</TableCell>
                    <TableCell>{inv.payment_date ? formatDate(inv.payment_date) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={invoiceStatusColors[inv.status]}>
                        {invoiceStatusLabels[inv.status]}
                      </Badge>
                    </TableCell>
                     <TableCell>
                       <Button size="sm" variant="ghost" onClick={() => onEdit(inv)}>
                         {inv.status === "pending" || inv.status === "overdue" || inv.status === "scheduled" ? "Registrar Pgto" : "Ver"}
                       </Button>
                     </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
