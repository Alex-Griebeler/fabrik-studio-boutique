import { useState, useMemo } from "react";
import { Plus, Search, Receipt, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useExpenses,
  useExpenseCategories,
  expenseStatusLabels,
  expenseStatusColors,
  type Expense,
  type ExpenseStatus,
} from "@/hooks/useExpenses";
import { formatCents } from "@/hooks/usePlans";
import { ExpenseFormDialog } from "@/components/finance/ExpenseFormDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatDate(d: string | null) {
  if (!d) return "—";
  return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

export default function Expenses() {
  const [statusFilter, setStatusFilter] = useState<"all" | ExpenseStatus>("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const { data: allExpenses } = useExpenses("all");
  const { data: expenses, isLoading } = useExpenses(statusFilter);
  const { data: categories } = useExpenseCategories();

  const kpis = useMemo(() => {
    const now = new Date();
    const thisMonth = allExpenses?.filter((e) => {
      const d = new Date(e.due_date + "T00:00:00");
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const totalMonth = thisMonth?.reduce((s, e) => s + e.amount_cents, 0) ?? 0;
    const paidMonth = thisMonth?.filter((e) => e.status === "paid").reduce((s, e) => s + e.amount_cents, 0) ?? 0;
    const pendingCount = allExpenses?.filter((e) => e.status === "pending").length ?? 0;
    const overdueExpenses = allExpenses?.filter((e) => {
      if (e.status !== "pending") return false;
      return new Date(e.due_date + "T00:00:00") < now;
    });
    const overdueTotal = overdueExpenses?.reduce((s, e) => s + e.amount_cents, 0) ?? 0;

    return { totalMonth, paidMonth, pendingCount, overdueTotal, overdueCount: overdueExpenses?.length ?? 0 };
  }, [allExpenses]);

  const filtered = expenses?.filter((e) =>
    !search.trim() || e.description.toLowerCase().includes(search.toLowerCase()) ||
    e.category?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Despesas" description="Gestão de contas a pagar e custos operacionais" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard title="Total do Mês" value={formatCents(kpis.totalMonth)} icon={Receipt} />
        <KPICard title="Pago no Mês" value={formatCents(kpis.paidMonth)} icon={CheckCircle} />
        <KPICard title="Pendentes" value={String(kpis.pendingCount)} icon={TrendingDown} />
        <KPICard
          title="Vencidas"
          value={`${kpis.overdueCount} despesas`}
          icon={AlertTriangle}
          description={kpis.overdueTotal > 0 ? formatCents(kpis.overdueTotal) : undefined}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
        <div className="flex gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar despesa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="paid">Pagos</SelectItem>
              <SelectItem value="cancelled">Cancelados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova Despesa
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))
            ) : !filtered?.length ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma despesa encontrada</TableCell></TableRow>
            ) : (
              filtered.map((exp) => (
                <TableRow key={exp.id}>
                  <TableCell className="font-medium">{exp.description}</TableCell>
                  <TableCell>{exp.category?.name || "—"}</TableCell>
                  <TableCell>{formatCents(exp.amount_cents)}</TableCell>
                  <TableCell>{formatDate(exp.due_date)}</TableCell>
                  <TableCell>{exp.payment_date ? formatDate(exp.payment_date) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={expenseStatusColors[exp.status]}>
                      {expenseStatusLabels[exp.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(exp); setDialogOpen(true); }}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ExpenseFormDialog open={dialogOpen} onOpenChange={setDialogOpen} expense={editing} />
    </div>
  );
}
