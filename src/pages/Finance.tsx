import { useState, useMemo } from "react";
import { Plus, FileText, ScrollText, Search, DollarSign, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useContracts, contractStatusLabels, paymentMethodLabels, type Contract } from "@/hooks/useContracts";
import { useInvoices, invoiceStatusLabels, invoiceStatusColors, type Invoice } from "@/hooks/useInvoices";
import { formatCents } from "@/hooks/usePlans";
import { ContractFormDialog } from "@/components/finance/ContractFormDialog";
import { InvoiceFormDialog } from "@/components/finance/InvoiceFormDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";

type ContractStatus = Database["public"]["Enums"]["contract_status"];
type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

const contractStatusColors: Record<ContractStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  suspended: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  expired: "bg-muted text-muted-foreground",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

export default function Finance() {
  const [tab, setTab] = useState("contracts");

  // All data for KPIs (unfiltered)
  const { data: allContracts } = useContracts("all");
  const { data: allInvoices } = useInvoices("all");

  // Contracts state
  const [contractStatus, setContractStatus] = useState<"all" | ContractStatus>("all");
  const [contractSearch, setContractSearch] = useState("");
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const { data: contracts, isLoading: loadingContracts } = useContracts(contractStatus);

  // Invoices state
  const [invoiceStatus, setInvoiceStatus] = useState<"all" | InvoiceStatus>("all");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const { data: invoices, isLoading: loadingInvoices } = useInvoices(invoiceStatus);

  // KPI calculations
  const kpis = useMemo(() => {
    const activeContracts = allContracts?.filter((c) => c.status === "active").length ?? 0;
    const monthlyRevenue = allContracts
      ?.filter((c) => c.status === "active")
      .reduce((sum, c) => sum + ((c.monthly_value_cents || 0) - (c.discount_cents || 0)), 0) ?? 0;
    const paidThisMonth = allInvoices
      ?.filter((i) => {
        if (i.status !== "paid" || !i.payment_date) return false;
        const now = new Date();
        const pd = new Date(i.payment_date + "T00:00:00");
        return pd.getMonth() === now.getMonth() && pd.getFullYear() === now.getFullYear();
      })
      .reduce((sum, i) => sum + (i.paid_amount_cents || i.amount_cents), 0) ?? 0;
    const overdueCount = allInvoices?.filter((i) => i.status === "overdue").length ?? 0;
    const overdueTotal = allInvoices
      ?.filter((i) => i.status === "overdue")
      .reduce((sum, i) => sum + i.amount_cents, 0) ?? 0;

    return { activeContracts, monthlyRevenue, paidThisMonth, overdueCount, overdueTotal };
  }, [allContracts, allInvoices]);

  const filteredContracts = contracts?.filter((c) =>
    !contractSearch.trim() || c.student?.full_name?.toLowerCase().includes(contractSearch.toLowerCase())
  );

  const filteredInvoices = invoices?.filter((i) =>
    !invoiceSearch.trim() || i.student?.full_name?.toLowerCase().includes(invoiceSearch.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Financeiro" description="Contratos, faturas e pagamentos" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard title="Contratos Ativos" value={String(kpis.activeContracts)} icon={ScrollText} />
        <KPICard title="Receita Mensal Prevista" value={formatCents(kpis.monthlyRevenue)} icon={TrendingUp} />
        <KPICard title="Recebido este Mês" value={formatCents(kpis.paidThisMonth)} icon={CheckCircle} />
        <KPICard
          title="Inadimplência"
          value={`${kpis.overdueCount} faturas`}
          icon={AlertTriangle}
          description={kpis.overdueTotal > 0 ? formatCents(kpis.overdueTotal) : undefined}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="contracts" className="gap-1.5">
            <ScrollText className="h-4 w-4" /> Contratos
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5">
            <FileText className="h-4 w-4" /> Faturas
          </TabsTrigger>
        </TabsList>

        {/* CONTRACTS TAB */}
        <TabsContent value="contracts" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-1 w-full sm:w-auto">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por aluno..." value={contractSearch} onChange={(e) => setContractSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={contractStatus} onValueChange={(v) => setContractStatus(v as any)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="suspended">Suspensos</SelectItem>
                  <SelectItem value="cancelled">Cancelados</SelectItem>
                  <SelectItem value="expired">Expirados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => { setEditingContract(null); setContractDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Novo Contrato
            </Button>
          </div>

          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Valor Mensal</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingContracts ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                  ))
                ) : !filteredContracts?.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum contrato encontrado</TableCell></TableRow>
                ) : (
                  filteredContracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.student?.full_name || "—"}</TableCell>
                      <TableCell>{c.plan?.name || "—"}</TableCell>
                      <TableCell>{formatDate(c.start_date)}</TableCell>
                      <TableCell>{c.monthly_value_cents ? formatCents(c.monthly_value_cents) : "—"}</TableCell>
                      <TableCell>{c.payment_method ? paymentMethodLabels[c.payment_method] : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={contractStatusColors[c.status]}>
                          {contractStatusLabels[c.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingContract(c); setContractDialogOpen(true); }}>
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* INVOICES TAB */}
        <TabsContent value="invoices" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-1 w-full sm:w-auto">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por aluno..." value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={invoiceStatus} onValueChange={(v) => setInvoiceStatus(v as any)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="paid">Pagos</SelectItem>
                  <SelectItem value="overdue">Vencidos</SelectItem>
                  <SelectItem value="cancelled">Cancelados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => { setEditingInvoice(null); setInvoiceDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Nova Fatura
            </Button>
          </div>

          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingInvoices ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                  ))
                ) : !filteredInvoices?.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma fatura encontrada</TableCell></TableRow>
                ) : (
                  filteredInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.student?.full_name || "—"}</TableCell>
                      <TableCell>{inv.reference_month || "—"}</TableCell>
                      <TableCell>{formatCents(inv.amount_cents)}</TableCell>
                      <TableCell>{formatDate(inv.due_date)}</TableCell>
                      <TableCell>{inv.payment_date ? formatDate(inv.payment_date) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={invoiceStatusColors[inv.status]}>
                          {invoiceStatusLabels[inv.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingInvoice(inv); setInvoiceDialogOpen(true); }}>
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <ContractFormDialog open={contractDialogOpen} onOpenChange={setContractDialogOpen} contract={editingContract} />
      <InvoiceFormDialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen} invoice={editingInvoice} />
    </div>
  );
}
