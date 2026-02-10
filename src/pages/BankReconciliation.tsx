import { useState, useRef, useMemo } from "react";
import { Upload, FileText, ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBankImports, useBankTransactions, useUploadBankStatement } from "@/hooks/useBankReconciliation";
import { formatCents } from "@/hooks/usePlans";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const typeLabels: Record<string, string> = {
  pix_received: "PIX Recebido",
  pix_sent: "PIX Enviado",
  card_received: "Cartão Recebido",
  card_visa_debit: "Visa Débito",
  card_visa_credit: "Visa Crédito",
  card_master_debit: "Master Débito",
  card_master_credit: "Master Crédito",
  boleto_paid: "Boleto Pago",
  utility_paid: "Concessionária",
  investment_return: "Rendimento",
  other_credit: "Crédito",
  other_debit: "Débito",
};

const matchStatusLabels: Record<string, string> = {
  unmatched: "Não conciliado",
  auto_matched: "Conciliado (auto)",
  manual_matched: "Conciliado (manual)",
  ignored: "Ignorado",
};

const matchStatusColors: Record<string, string> = {
  unmatched: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  auto_matched: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  manual_matched: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  ignored: "bg-muted text-muted-foreground",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

export default function BankReconciliation() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImport, setSelectedImport] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");

  const { data: imports, isLoading: loadingImports } = useBankImports();
  const { data: transactions, isLoading: loadingTx } = useBankTransactions(selectedImport);
  const uploadMutation = useUploadBankStatement();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "ofx") {
      return;
    }

    const text = await file.text();
    uploadMutation.mutate({ fileContent: text, fileName: file.name });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Auto-select first import
  const activeImportId = selectedImport ?? imports?.[0]?.id ?? null;
  const activeImport = imports?.find((i) => i.id === activeImportId);

  const filteredTx = useMemo(() => {
    if (!transactions) return [];
    if (filterType === "all") return transactions;
    if (filterType === "credit") return transactions.filter((t) => t.transaction_type === "credit");
    if (filterType === "debit") return transactions.filter((t) => t.transaction_type === "debit");
    return transactions.filter((t) => t.match_status === filterType);
  }, [transactions, filterType]);

  const kpis = useMemo(() => {
    if (!transactions) return { credits: 0, debits: 0, unmatched: 0, total: 0 };
    const credits = transactions.filter((t) => t.transaction_type === "credit").reduce((s, t) => s + t.amount_cents, 0);
    const debits = transactions.filter((t) => t.transaction_type === "debit").reduce((s, t) => s + Math.abs(t.amount_cents), 0);
    const unmatched = transactions.filter((t) => t.match_status === "unmatched").length;
    return { credits, debits, unmatched, total: transactions.length };
  }, [transactions]);

  return (
    <div>
      <PageHeader title="Conciliação Bancária" description="Importe extratos e concilie com faturas e despesas" />

      {/* Upload area */}
      <div className="flex items-center gap-3 mb-6">
        <input
          ref={fileInputRef}
          type="file"
          accept=".ofx"
          onChange={handleFileUpload}
          className="hidden"
        />
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
          {uploadMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          Importar Extrato OFX
        </Button>

        {imports && imports.length > 0 && (
          <Select value={activeImportId ?? ""} onValueChange={(v) => setSelectedImport(v)}>
            <SelectTrigger className="w-[320px]">
              <SelectValue placeholder="Selecione uma importação" />
            </SelectTrigger>
            <SelectContent>
              {imports.map((imp) => (
                <SelectItem key={imp.id} value={imp.id}>
                  {imp.file_name} — {formatDate(imp.period_start)} a {formatDate(imp.period_end)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* KPIs for selected import */}
      {activeImport && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard title="Transações" value={String(kpis.total)} icon={FileText} />
          <KPICard title="Créditos" value={formatCents(kpis.credits)} icon={ArrowDownCircle} />
          <KPICard title="Débitos" value={formatCents(kpis.debits)} icon={ArrowUpCircle} />
          <KPICard
            title="Não Conciliados"
            value={String(kpis.unmatched)}
            icon={kpis.unmatched > 0 ? AlertCircle : CheckCircle2}
          />
        </div>
      )}

      {/* Filter */}
      {activeImport && (
        <div className="flex gap-2 mb-4">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="credit">Créditos</SelectItem>
              <SelectItem value="debit">Débitos</SelectItem>
              <SelectItem value="unmatched">Não conciliados</SelectItem>
              <SelectItem value="auto_matched">Conciliados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Transaction table */}
      {activeImport && (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingTx ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : !filteredTx.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhuma transação encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredTx.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{formatDate(tx.posted_date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={tx.transaction_type === "credit"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      }>
                        {typeLabels[tx.parsed_type ?? ""] ?? tx.parsed_type ?? tx.transaction_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-sm" title={tx.memo}>
                      {tx.memo}
                    </TableCell>
                    <TableCell className="text-sm">{tx.parsed_name || "—"}</TableCell>
                    <TableCell className={`text-right font-medium ${tx.transaction_type === "credit" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {tx.transaction_type === "credit" ? "+" : "−"}{formatCents(Math.abs(tx.amount_cents))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={matchStatusColors[tx.match_status] ?? ""}>
                        {matchStatusLabels[tx.match_status] ?? tx.match_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Empty state */}
      {!activeImport && !loadingImports && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Upload className="h-12 w-12 mb-4 opacity-40" />
          <p className="text-lg font-medium">Nenhuma importação encontrada</p>
          <p className="text-sm">Importe um extrato OFX do Itaú para começar a conciliação.</p>
        </div>
      )}
    </div>
  );
}
