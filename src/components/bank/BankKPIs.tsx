import { FileText, ArrowDownCircle, ArrowUpCircle, CheckCircle2, AlertCircle } from "lucide-react";
import { KPICard } from "@/components/shared/KPICard";
import { formatCents } from "@/hooks/usePlans";

interface BankKPIsProps {
  kpis: {
    credits: number;
    debits: number;
    unmatched: number;
    matched: number;
    total: number;
  };
}

export function BankKPIs({ kpis }: BankKPIsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <KPICard title="Transações" value={String(kpis.total)} icon={FileText} />
      <KPICard title="Créditos" value={formatCents(kpis.credits)} icon={ArrowDownCircle} />
      <KPICard title="Débitos" value={formatCents(kpis.debits)} icon={ArrowUpCircle} />
      <KPICard
        title="Vinculados"
        value={`${kpis.matched} / ${kpis.total}`}
        icon={kpis.unmatched > 0 ? AlertCircle : CheckCircle2}
        description={kpis.unmatched > 0 ? `${kpis.unmatched} pendentes` : "Tudo vinculado!"}
      />
    </div>
  );
}
