import { useState, useMemo, useCallback } from "react";
import { Plus, Search, Receipt, TrendingDown, AlertTriangle, CheckCircle, Settings2, Zap, ChevronLeft, ChevronRight, BarChart3, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ExpenseCategoryManager } from "@/components/finance/ExpenseCategoryManager";
import { ExpenseCategoryRulesManager } from "@/components/finance/ExpenseCategoryRulesManager";
import { KPICard } from "@/components/shared/KPICard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  useExpenses,
  useExpenseCategories,
  useDeleteExpense,
  expenseStatusLabels,
  expenseStatusColors,
  type Expense,
  type ExpenseStatus,
} from "@/hooks/useExpenses";
import { useSuppliers } from "@/hooks/useSuppliers";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCents } from "@/hooks/usePlans";
import { ExpenseFormDialog } from "@/components/finance/ExpenseFormDialog";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
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
  const [showCategories, setShowCategories] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showDashboard, setShowDashboard] = useState(true);

  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: allExpenses } = useExpenses("all");
  const { data: expenses, isLoading } = useExpenses(statusFilter);
  const { data: categories } = useExpenseCategories();
  const { data: suppliers } = useSuppliers();
  const deleteExpense = useDeleteExpense();

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);

  const monthExpenses = useMemo(() => {
    return allExpenses?.filter((e) => {
      const d = new Date(e.due_date + "T00:00:00");
      return d >= monthStart && d <= monthEnd;
    }) ?? [];
  }, [allExpenses, monthStart, monthEnd]);

  const kpis = useMemo(() => {
    const totalMonth = monthExpenses.reduce((s, e) => s + e.amount_cents, 0);
    const paidMonth = monthExpenses.filter((e) => e.status === "paid").reduce((s, e) => s + e.amount_cents, 0);
    const pendingCount = monthExpenses.filter((e) => e.status === "pending").length;
    const now = new Date();
    const overdueExpenses = monthExpenses.filter((e) => {
      if (e.status !== "pending") return false;
      return new Date(e.due_date + "T00:00:00") < now;
    });
    const overdueTotal = overdueExpenses.reduce((s, e) => s + e.amount_cents, 0);

    return { totalMonth, paidMonth, pendingCount, overdueTotal, overdueCount: overdueExpenses.length };
  }, [monthExpenses]);

  // Category breakdown for the dashboard
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; color: string; total: number; count: number }>();
    monthExpenses.forEach((e) => {
      const catName = e.category?.name || "Sem categoria";
      const catColor = e.category?.color || "gray";
      const existing = map.get(catName) ?? { name: catName, color: catColor, total: 0, count: 0 };
      existing.total += e.amount_cents;
      existing.count += 1;
      map.set(catName, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [monthExpenses]);

  const maxCategoryTotal = categoryBreakdown[0]?.total || 1;

  const filtered = expenses?.filter((e) => {
    const d = new Date(e.due_date + "T00:00:00");
    const inMonth = d >= monthStart && d <= monthEnd;
    const matchesSearch = !search.trim() || e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.category?.name?.toLowerCase().includes(search.toLowerCase()) ||
      e.supplier?.name?.toLowerCase().includes(search.toLowerCase());
    if (supplierFilter !== "all" && e.supplier_id !== supplierFilter) return false;
    return inMonth && matchesSearch;
  });

  return (
    <div>
      <PageHeader title="Despesas" description="Gestão de contas a pagar e custos operacionais" />

      {/* Month selector */}
      <div className="flex items-center justify-between mb-6">
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
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowDashboard(!showDashboard)}>
          <BarChart3 className="h-4 w-4 mr-1" />
          {showDashboard ? "Ocultar resumo" : "Ver resumo"}
        </Button>
      </div>

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

      {/* Monthly dashboard - category breakdown */}
      {showDashboard && categoryBreakdown.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Despesas por Categoria — {format(selectedMonth, "MMMM yyyy", { locale: ptBR })}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {categoryBreakdown.map((cat) => (
                <div key={cat.name} className="flex items-center gap-3">
                  <div className="w-[140px] truncate text-sm font-medium">{cat.name}</div>
                  <div className="flex-1">
                    <Progress value={(cat.total / maxCategoryTotal) * 100} className="h-3" />
                  </div>
                  <div className="w-[100px] text-right text-sm font-semibold">{formatCents(cat.total)}</div>
                  <div className="w-[50px] text-right text-xs text-muted-foreground">{cat.count}x</div>
                </div>
              ))}
              <div className="flex items-center gap-3 pt-2 border-t">
                <div className="w-[140px] text-sm font-bold">Total</div>
                <div className="flex-1" />
                <div className="w-[100px] text-right text-sm font-bold">{formatCents(kpis.totalMonth)}</div>
                <div className="w-[50px] text-right text-xs text-muted-foreground">{monthExpenses.length}x</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
        <div className="flex gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar despesa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | ExpenseStatus)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="paid">Pagos</SelectItem>
              <SelectItem value="cancelled">Cancelados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Fornecedores</SelectItem>
              {suppliers?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setShowRules(!showRules); setShowCategories(false); }}>
            <Zap className="h-4 w-4 mr-1" /> Regras
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setShowCategories(!showCategories); setShowRules(false); }}>
            <Settings2 className="h-4 w-4 mr-1" /> Categorias
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova Despesa
          </Button>
        </div>
      </div>

      {showCategories && (
        <div className="mb-6">
          <ExpenseCategoryManager />
        </div>
      )}

      {showRules && (
        <div className="mb-6">
          <ExpenseCategoryRulesManager />
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Fornecedor</TableHead>
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
                <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))
            ) : !filtered?.length ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma despesa encontrada neste mês</TableCell></TableRow>
            ) : (
              filtered.map((exp) => (
                <TableRow key={exp.id}>
                  <TableCell className="font-medium">{exp.description}</TableCell>
                  <TableCell>{exp.category?.name || "—"}</TableCell>
                  <TableCell>{exp.supplier?.name || "—"}</TableCell>
                  <TableCell>{formatCents(exp.amount_cents)}</TableCell>
                  <TableCell>{formatDate(exp.due_date)}</TableCell>
                  <TableCell>{exp.payment_date ? formatDate(exp.payment_date) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={expenseStatusColors[exp.status]}>
                      {expenseStatusLabels[exp.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(exp); setDialogOpen(true); }}>
                        Editar
                      </Button>
                      <TooltipProvider>
                        <AlertDialog>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-8 w-8 p-0">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Excluir despesa</TooltipContent>
                          </Tooltip>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir despesa?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir "<strong>{exp.description}</strong>"? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteExpense.mutate(exp.id)}
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TooltipProvider>
                    </div>
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
