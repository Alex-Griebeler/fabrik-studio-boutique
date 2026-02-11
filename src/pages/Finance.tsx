import { useState, useMemo } from "react";
import { ScrollText, FileText, Receipt, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useContracts, type Contract } from "@/hooks/useContracts";
import { useInvoices, type Invoice } from "@/hooks/useInvoices";
import { formatCents } from "@/hooks/usePlans";
import { ContractsTab } from "@/components/finance/ContractsTab";
import { InvoicesTab } from "@/components/finance/InvoicesTab";
import { ContractFormDialog } from "@/components/finance/ContractFormDialog";
import { InvoiceFormDialog } from "@/components/finance/InvoiceFormDialog";
import { NfseTab } from "@/components/finance/NfseTab";

export default function Finance() {
  const [tab, setTab] = useState("contracts");

  const { data: allContracts } = useContracts("all");
  const { data: allInvoices } = useInvoices("all");
  const { data: contracts, isLoading: loadingContracts } = useContracts("all");
  const { data: invoices, isLoading: loadingInvoices } = useInvoices("all");

  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

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
          <TabsTrigger value="nfse" className="gap-1.5">
            <Receipt className="h-4 w-4" /> NF-e
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contracts">
          <ContractsTab
            contracts={contracts}
            isLoading={loadingContracts}
            onEdit={(c) => { setEditingContract(c); setContractDialogOpen(true); }}
            onNew={() => { setEditingContract(null); setContractDialogOpen(true); }}
          />
        </TabsContent>

        <TabsContent value="invoices">
          <InvoicesTab
            invoices={invoices}
            isLoading={loadingInvoices}
            onEdit={(inv) => { setEditingInvoice(inv); setInvoiceDialogOpen(true); }}
            onNew={() => { setEditingInvoice(null); setInvoiceDialogOpen(true); }}
          />
        </TabsContent>

        <TabsContent value="nfse">
          <NfseTab />
        </TabsContent>
      </Tabs>

      <ContractFormDialog open={contractDialogOpen} onOpenChange={setContractDialogOpen} contract={editingContract} />
      <InvoiceFormDialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen} invoice={editingInvoice} />
    </div>
  );
}
