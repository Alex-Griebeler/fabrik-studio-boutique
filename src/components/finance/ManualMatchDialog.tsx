import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Link2, FileText, Receipt } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/hooks/usePlans";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { BankTransaction } from "@/hooks/useBankReconciliation";

interface ManualMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: BankTransaction | null;
  onConfirm: (matchedType: "invoice" | "expense", matchedId: string) => void;
  isPending: boolean;
}

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  overdue: "Atrasada",
  paid: "Paga",
  cancelled: "Cancelada",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-muted text-muted-foreground",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

export function ManualMatchDialog({ open, onOpenChange, transaction, onConfirm, isPending }: ManualMatchDialogProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"invoice" | "expense">(
    transaction?.transaction_type === "debit" ? "expense" : "invoice"
  );

  const { data: invoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ["invoices-for-match"],
    enabled: open && tab === "invoice",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, amount_cents, due_date, status, reference_month, student_id, contract_id, students(full_name)")
        .in("status", ["pending", "overdue"])
        .order("due_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: expenses, isLoading: loadingExpenses } = useQuery({
    queryKey: ["expenses-for-match"],
    enabled: open && tab === "expense",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, amount_cents, due_date, status, description, category_id, expense_categories(name)")
        .in("status", ["pending"])
        .order("due_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    if (!search.trim()) return invoices;
    const q = search.toLowerCase();
    return invoices.filter((inv) => {
      const studentName = (inv.students as any)?.full_name ?? "";
      return (
        studentName.toLowerCase().includes(q) ||
        (inv.reference_month ?? "").toLowerCase().includes(q) ||
        formatCents(inv.amount_cents).includes(q)
      );
    });
  }, [invoices, search]);

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    if (!search.trim()) return expenses;
    const q = search.toLowerCase();
    return expenses.filter((exp) => {
      const catName = (exp.expense_categories as any)?.name ?? "";
      return (
        exp.description.toLowerCase().includes(q) ||
        catName.toLowerCase().includes(q) ||
        formatCents(exp.amount_cents).includes(q)
      );
    });
  }, [expenses, search]);

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular Manualmente
          </DialogTitle>
        </DialogHeader>

        {/* Transaction summary */}
        <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
          <div className="font-medium truncate" title={transaction.memo}>{transaction.memo}</div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <span>{fmtDate(transaction.posted_date)}</span>
            <span className={transaction.transaction_type === "credit" ? "text-green-600 dark:text-green-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
              {transaction.transaction_type === "credit" ? "+" : "−"}{formatCents(Math.abs(transaction.amount_cents))}
            </span>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as "invoice" | "expense"); setSearch(""); }}>
          <TabsList className="w-full">
            <TabsTrigger value="invoice" className="flex-1 gap-1.5">
              <FileText className="h-4 w-4" />
              Faturas
            </TabsTrigger>
            <TabsTrigger value="expense" className="flex-1 gap-1.5">
              <Receipt className="h-4 w-4" />
              Despesas
            </TabsTrigger>
          </TabsList>

          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={tab === "invoice" ? "Buscar por aluno, mês ou valor..." : "Buscar por descrição, categoria ou valor..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <TabsContent value="invoice" className="mt-3 overflow-y-auto max-h-[340px] space-y-1.5">
            {loadingInvoices ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : !filteredInvoices.length ? (
              <p className="text-center text-sm text-muted-foreground py-6">Nenhuma fatura pendente encontrada</p>
            ) : (
              filteredInvoices.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => onConfirm("invoice", inv.id)}
                  disabled={isPending}
                  className="w-full flex items-center justify-between rounded-lg border p-3 text-left hover:bg-accent/50 transition-colors disabled:opacity-50"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {(inv.students as any)?.full_name ?? "Aluno"}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Venc: {fmtDate(inv.due_date)}</span>
                      {inv.reference_month && <span>Ref: {inv.reference_month}</span>}
                      <Badge variant="outline" className={statusColors[inv.status] ?? ""}>
                        {statusLabels[inv.status] ?? inv.status}
                      </Badge>
                    </div>
                  </div>
                  <span className="text-sm font-semibold whitespace-nowrap ml-3">
                    {formatCents(inv.amount_cents)}
                  </span>
                </button>
              ))
            )}
          </TabsContent>

          <TabsContent value="expense" className="mt-3 overflow-y-auto max-h-[340px] space-y-1.5">
            {loadingExpenses ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : !filteredExpenses.length ? (
              <p className="text-center text-sm text-muted-foreground py-6">Nenhuma despesa pendente encontrada</p>
            ) : (
              filteredExpenses.map((exp) => (
                <button
                  key={exp.id}
                  onClick={() => onConfirm("expense", exp.id)}
                  disabled={isPending}
                  className="w-full flex items-center justify-between rounded-lg border p-3 text-left hover:bg-accent/50 transition-colors disabled:opacity-50"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-sm font-medium truncate">{exp.description}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Venc: {fmtDate(exp.due_date)}</span>
                      <span>{(exp.expense_categories as any)?.name ?? ""}</span>
                      <Badge variant="outline" className={statusColors[exp.status] ?? ""}>
                        {statusLabels[exp.status] ?? exp.status}
                      </Badge>
                    </div>
                  </div>
                  <span className="text-sm font-semibold whitespace-nowrap ml-3">
                    {formatCents(exp.amount_cents)}
                  </span>
                </button>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
