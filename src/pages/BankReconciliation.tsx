import { useState, useRef, useMemo, useCallback } from "react";
import { Upload, Loader2, Wand2, Zap } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useBankImports, useBankTransactions, useUploadBankStatement,
  useRunMatching, useApproveMatch, useRejectMatch, useIgnoreTransaction, useBatchApproveMatches,
  type MatchSuggestion,
} from "@/hooks/useBankReconciliation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ManualMatchDialog } from "@/components/finance/ManualMatchDialog";
import type { BankTransaction } from "@/hooks/useBankReconciliation";
import { BankKPIs } from "@/components/bank/BankKPIs";
import { BankSuggestionsBanner } from "@/components/bank/BankSuggestionsBanner";
import { BankTransactionRow } from "@/components/bank/BankTransactionRow";

function formatDate(d: string | null) {
  if (!d) return "—";
  return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

export default function BankReconciliation() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImport, setSelectedImport] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestion[]>([]);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [manualMatchTx, setManualMatchTx] = useState<BankTransaction | null>(null);

  const { data: imports, isLoading: loadingImports } = useBankImports();
  const { data: transactions, isLoading: loadingTx } = useBankTransactions(selectedImport ?? imports?.[0]?.id ?? null);
  const uploadMutation = useUploadBankStatement();
  const matchMutation = useRunMatching();
  const approveMutation = useApproveMatch();
  const rejectMutation = useRejectMatch();
  const ignoreMutation = useIgnoreTransaction();
  const batchApproveMutation = useBatchApproveMatches();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "ofx" && ext !== "csv") {
      toast.error("Formato não suportado. Use arquivos OFX ou CSV.");
      return;
    }
    const text = await file.text();
    uploadMutation.mutate({ fileContent: text, fileName: file.name, fileType: ext });
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

  const handleApprove = useCallback((suggestion: MatchSuggestion) => {
    approveMutation.mutate(
      { transactionId: suggestion.transaction_id, matchedType: suggestion.matched_type, matchedId: suggestion.matched_id },
      { onSuccess: () => {
        setMatchSuggestions((prev) => prev.filter((s) => s.transaction_id !== suggestion.transaction_id));
        setSelectedTxIds((prev) => { const next = new Set(prev); next.delete(suggestion.transaction_id); return next; });
      }}
    );
  }, [approveMutation]);

  const handleReject = useCallback((transactionId: string) => {
    setMatchSuggestions((prev) => prev.filter((s) => s.transaction_id !== transactionId));
    setSelectedTxIds((prev) => { const next = new Set(prev); next.delete(transactionId); return next; });
  }, []);

  const toggleSelect = useCallback((txId: string) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId); else next.add(txId);
      return next;
    });
  }, []);

  const selectableSuggestions = useMemo(() => {
    return matchSuggestions.filter((s) => {
      const tx = transactions?.find((t) => t.id === s.transaction_id);
      return tx && tx.match_status === "unmatched";
    });
  }, [matchSuggestions, transactions]);

  const allSelected = selectableSuggestions.length > 0 && selectableSuggestions.every((s) => selectedTxIds.has(s.transaction_id));

  const toggleSelectAll = useCallback(() => {
    const allIds = selectableSuggestions.map((s) => s.transaction_id);
    const currentlyAllSelected = allIds.every((id) => selectedTxIds.has(id));
    setSelectedTxIds(currentlyAllSelected ? new Set() : new Set(allIds));
  }, [selectableSuggestions, selectedTxIds]);

  const handleBatchApprove = useCallback(() => {
    const toApprove = selectableSuggestions.filter((s) => selectedTxIds.has(s.transaction_id));
    if (!toApprove.length) return;
    batchApproveMutation.mutate(toApprove, {
      onSuccess: () => {
        setMatchSuggestions((prev) => prev.filter((s) => !selectedTxIds.has(s.transaction_id)));
        setSelectedTxIds(new Set());
      },
    });
  }, [selectableSuggestions, selectedTxIds, batchApproveMutation]);

  const handleIgnore = useCallback((txId: string) => {
    ignoreMutation.mutate(txId);
  }, [ignoreMutation]);

  return (
    <div>
      <PageHeader title="Conciliação Bancária" description="Importe extratos do banco e vincule cada movimentação à sua respectiva fatura ou despesa" />

      {/* Upload + Import selector */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input ref={fileInputRef} type="file" accept=".ofx,.csv" onChange={handleFileUpload} className="hidden" />
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
          {uploadMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Importar Extrato
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
                  <Button variant="outline" onClick={() => handleRunMatching(false)} disabled={matchMutation.isPending}>
                    {matchMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                    Buscar Vínculos
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-center">
                  O sistema compara as movimentações do extrato com suas faturas e despesas pendentes e sugere vínculos para você revisar antes de confirmar.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => handleRunMatching(true)} disabled={matchMutation.isPending}>
                    {matchMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                    Vincular Automaticamente
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-center">
                  Vincula automaticamente as movimentações do extrato que têm correspondência exata (mesmo valor e data) com faturas ou despesas pendentes — sem necessidade de revisão.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      <BankSuggestionsBanner
        suggestions={matchSuggestions}
        selectedCount={selectedTxIds.size}
        selectableSuggestions={selectableSuggestions}
        allSelected={allSelected}
        onToggleSelectAll={toggleSelectAll}
        onBatchApprove={handleBatchApprove}
        isBatchPending={batchApproveMutation.isPending}
      />

      {activeImport && <BankKPIs kpis={kpis} />}

      {/* Filter */}
      {activeImport && (
        <div className="flex gap-2 mb-4">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="credit">Créditos</SelectItem>
              <SelectItem value="debit">Débitos</SelectItem>
              <SelectItem value="unmatched">Pendentes</SelectItem>
              <SelectItem value="auto_matched">Vinculados (automático)</SelectItem>
              <SelectItem value="manual_matched">Vinculados (manual)</SelectItem>
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
                {matchSuggestions.length > 0 && <TableHead className="w-[40px]" />}
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
                  <TableRow key={i}><TableCell colSpan={matchSuggestions.length > 0 ? 8 : 7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ))
              ) : !filteredTx.length ? (
                <TableRow>
                  <TableCell colSpan={matchSuggestions.length > 0 ? 8 : 7} className="text-center text-muted-foreground py-8">
                    Nenhuma transação encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredTx.map((tx) => (
                  <BankTransactionRow
                    key={tx.id}
                    tx={tx}
                    suggestion={suggestionMap.get(tx.id)}
                    showCheckbox={matchSuggestions.length > 0}
                    isSelected={selectedTxIds.has(tx.id)}
                    onToggleSelect={toggleSelect}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onManualMatch={setManualMatchTx}
                    onIgnore={handleIgnore}
                    isApprovePending={approveMutation.isPending}
                    isIgnorePending={ignoreMutation.isPending}
                  />
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
          <p className="text-sm">Importe um extrato OFX ou CSV do seu banco para começar a conciliação.</p>
        </div>
      )}

      <ManualMatchDialog
        open={!!manualMatchTx}
        onOpenChange={(open) => { if (!open) setManualMatchTx(null); }}
        transaction={manualMatchTx}
        onConfirm={(matchedType, matchedId) => {
          if (!manualMatchTx) return;
          approveMutation.mutate(
            { transactionId: manualMatchTx.id, matchedType, matchedId },
            { onSuccess: () => setManualMatchTx(null) }
          );
        }}
        isPending={approveMutation.isPending}
      />
    </div>
  );
}
