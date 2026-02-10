import { useState, useRef, useMemo } from "react";
import {
  Upload, FileText, ArrowDownCircle, ArrowUpCircle, CheckCircle2, AlertCircle,
  Loader2, Wand2, Check, X, EyeOff, Zap,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useBankImports, useBankTransactions, useUploadBankStatement,
  useRunMatching, useApproveMatch, useRejectMatch, useIgnoreTransaction,
  type MatchSuggestion,
} from "@/hooks/useBankReconciliation";
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
  suggested: "Sugestão",
  auto_matched: "Conciliado (auto)",
  manual_matched: "Conciliado (manual)",
  ignored: "Ignorado",
};

const matchStatusColors: Record<string, string> = {
  unmatched: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  suggested: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  auto_matched: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  manual_matched: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  ignored: "bg-muted text-muted-foreground",
};

const confidenceLabels: Record<string, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const confidenceColors: Record<string, string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

export default function BankReconciliation() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImport, setSelectedImport] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestion[]>([]);

  const { data: imports, isLoading: loadingImports } = useBankImports();
  const { data: transactions, isLoading: loadingTx } = useBankTransactions(selectedImport ?? imports?.[0]?.id ?? null);
  const uploadMutation = useUploadBankStatement();
  const matchMutation = useRunMatching();
  const approveMutation = useApproveMatch();
  const rejectMutation = useRejectMatch();
  const ignoreMutation = useIgnoreTransaction();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "ofx") return;
    const text = await file.text();
    uploadMutation.mutate({ fileContent: text, fileName: file.name });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const activeImportId = selectedImport ?? imports?.[0]?.id ?? null;
  const activeImport = imports?.find((i) => i.id === activeImportId);

  const handleRunMatching = (autoApply: boolean) => {
    if (!activeImportId) return;
    matchMutation.mutate(
      { importId: activeImportId, autoApply },
      {
        onSuccess: (data) => {
          if (!autoApply) {
            setMatchSuggestions(data.matches);
          } else {
            setMatchSuggestions([]);
          }
        },
      }
    );
  };

  // Build a map of suggestions by transaction_id for quick lookup
  const suggestionMap = useMemo(() => {
    const map = new Map<string, MatchSuggestion>();
    matchSuggestions.forEach((s) => map.set(s.transaction_id, s));
    return map;
  }, [matchSuggestions]);

  const filteredTx = useMemo(() => {
    if (!transactions) return [];
    let result = transactions;
    if (filterType === "credit") result = result.filter((t) => t.transaction_type === "credit");
    else if (filterType === "debit") result = result.filter((t) => t.transaction_type === "debit");
    else if (filterType !== "all") result = result.filter((t) => t.match_status === filterType);
    return result;
  }, [transactions, filterType]);

  const kpis = useMemo(() => {
    if (!transactions) return { credits: 0, debits: 0, unmatched: 0, matched: 0, total: 0 };
    const credits = transactions.filter((t) => t.transaction_type === "credit").reduce((s, t) => s + t.amount_cents, 0);
    const debits = transactions.filter((t) => t.transaction_type === "debit").reduce((s, t) => s + Math.abs(t.amount_cents), 0);
    const unmatched = transactions.filter((t) => t.match_status === "unmatched").length;
    const matched = transactions.filter((t) => t.match_status === "auto_matched" || t.match_status === "manual_matched").length;
    return { credits, debits, unmatched, matched, total: transactions.length };
  }, [transactions]);

  const handleApprove = (suggestion: MatchSuggestion) => {
    approveMutation.mutate(
      { transactionId: suggestion.transaction_id, matchedType: suggestion.matched_type, matchedId: suggestion.matched_id },
      { onSuccess: () => setMatchSuggestions((prev) => prev.filter((s) => s.transaction_id !== suggestion.transaction_id)) }
    );
  };

  const handleReject = (transactionId: string) => {
    setMatchSuggestions((prev) => prev.filter((s) => s.transaction_id !== transactionId));
  };

  return (
    <div>
      <PageHeader title="Conciliação Bancária" description="Importe extratos e concilie com faturas e despesas" />

      {/* Upload + Import selector */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input ref={fileInputRef} type="file" accept=".ofx" onChange={handleFileUpload} className="hidden" />
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
          {uploadMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Importar OFX
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

        {activeImport && (
          <div className="flex gap-2 ml-auto">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => handleRunMatching(false)}
                    disabled={matchMutation.isPending}
                  >
                    {matchMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                    Sugerir Matches
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Analisa transações e sugere matches para revisão</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => handleRunMatching(true)}
                    disabled={matchMutation.isPending}
                  >
                    {matchMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                    Auto-conciliar
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Aplica automaticamente matches de alta confiança</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Match suggestions banner */}
      {matchSuggestions.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Wand2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
              {matchSuggestions.length} sugestões de match encontradas
            </span>
          </div>
          <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
            Revise as sugestões na tabela abaixo e aprove ou rejeite cada uma.
          </p>
        </div>
      )}

      {/* KPIs */}
      {activeImport && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard title="Transações" value={String(kpis.total)} icon={FileText} />
          <KPICard title="Créditos" value={formatCents(kpis.credits)} icon={ArrowDownCircle} />
          <KPICard title="Débitos" value={formatCents(kpis.debits)} icon={ArrowUpCircle} />
          <KPICard
            title="Conciliados"
            value={`${kpis.matched} / ${kpis.total}`}
            icon={kpis.unmatched > 0 ? AlertCircle : CheckCircle2}
            description={kpis.unmatched > 0 ? `${kpis.unmatched} pendentes` : "Tudo conciliado!"}
          />
        </div>
      )}

      {/* Filter */}
      {activeImport && (
        <div className="flex gap-2 mb-4">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="credit">Créditos</SelectItem>
              <SelectItem value="debit">Débitos</SelectItem>
              <SelectItem value="unmatched">Não conciliados</SelectItem>
              <SelectItem value="auto_matched">Conciliados (auto)</SelectItem>
              <SelectItem value="manual_matched">Conciliados (manual)</SelectItem>
              <SelectItem value="ignored">Ignorados</SelectItem>
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
                <TableHead className="w-[140px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingTx ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ))
              ) : !filteredTx.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma transação encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredTx.map((tx) => {
                  const suggestion = suggestionMap.get(tx.id);
                  const hasSuggestion = !!suggestion && tx.match_status === "unmatched";
                  return (
                    <TableRow key={tx.id} className={hasSuggestion ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}>
                      <TableCell>{formatDate(tx.posted_date)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={tx.transaction_type === "credit"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        }>
                          {typeLabels[tx.parsed_type ?? ""] ?? tx.parsed_type ?? tx.transaction_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[250px]">
                        <div className="truncate text-sm" title={tx.memo}>{tx.memo}</div>
                        {hasSuggestion && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <Badge variant="outline" className={confidenceColors[suggestion.confidence]}>
                              {confidenceLabels[suggestion.confidence]}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">{suggestion.reason}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{tx.parsed_name || "—"}</TableCell>
                      <TableCell className={`text-right font-medium ${tx.transaction_type === "credit" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {tx.transaction_type === "credit" ? "+" : "−"}{formatCents(Math.abs(tx.amount_cents))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={hasSuggestion ? matchStatusColors.suggested : (matchStatusColors[tx.match_status] ?? "")}>
                          {hasSuggestion ? "Sugestão" : (matchStatusLabels[tx.match_status] ?? tx.match_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {hasSuggestion && (
                            <>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                                      onClick={() => handleApprove(suggestion)}
                                      disabled={approveMutation.isPending}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Aprovar match ({suggestion.matched_type === "invoice" ? "fatura" : "despesa"})</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                      onClick={() => handleReject(tx.id)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Rejeitar sugestão</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </>
                          )}
                          {tx.match_status === "unmatched" && !hasSuggestion && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => ignoreMutation.mutate(tx.id)}
                                    disabled={ignoreMutation.isPending}
                                  >
                                    <EyeOff className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Ignorar transação</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
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
