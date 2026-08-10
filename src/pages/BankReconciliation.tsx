import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { Upload, Loader2, Wand2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useBankImports, useBankTransactions, useUploadBankStatement,
  useRunMatching, useIgnoreTransaction, useRestoreTransaction,
  type MatchSuggestion,
} from "@/hooks/useBankReconciliation";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BankKPIs } from "@/components/bank/BankKPIs";
import { BankTransactionRow } from "@/components/bank/BankTransactionRow";
import { useBankAccounts } from "@/hooks/useBankAccounts";
import {
  BankTransactionFilters,
  applyTransactionFilters,
  filterImportsByAccount,
  extractUniqueOrigins,
  INITIAL_FILTERS,
  type TransactionFilters,
} from "@/components/bank/BankTransactionFilters";

function formatDate(d: string | null) {
  if (!d) return "—";
  return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

/**
 * Onda 2c-1: a tela degradou DE PROPÓSITO para importar / ver / ignorar.
 * O fluxo antigo de aprovação (que quitava fatura/despesa direto do
 * navegador, sem transação) morreu; as sugestões continuam visíveis como
 * informação. Vincular/conciliar volta na 2c-3/2c-5 via RPC transacional.
 */
export default function BankReconciliation() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImport, setSelectedImport] = useState<string | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>(INITIAL_FILTERS);
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestion[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;
  const [duplicateDialog, setDuplicateDialog] = useState<{ open: boolean; details: string; pendingUpload: { fileContent: string; fileName: string; fileType: string } | null }>({ open: false, details: "", pendingUpload: null });

  const { data: imports, isLoading: loadingImports } = useBankImports();
  const { data: bankAccounts } = useBankAccounts();

  // Filter imports by selected account
  const visibleImports = useMemo(() => {
    if (!imports) return [];
    return filterImportsByAccount(imports, filters.accountId);
  }, [imports, filters.accountId]);

  const activeImportId = selectedImport ?? (visibleImports?.length ? "__all__" : null);
  const activeImport = activeImportId && activeImportId !== "__all__" ? visibleImports?.find((i) => i.id === activeImportId) : null;
  const isConsolidatedView = activeImportId === "__all__";

  const { data: transactions, isLoading: loadingTx } = useBankTransactions(activeImportId);
  const uploadMutation = useUploadBankStatement();
  const matchMutation = useRunMatching();
  const ignoreMutation = useIgnoreTransaction();
  const restoreMutation = useRestoreTransaction();

  const handleRestore = useCallback((txId: string) => {
    restoreMutation.mutate(txId);
  }, [restoreMutation]);

  const doUpload = (fileContent: string, fileName: string, fileType: string, forceImport = false) => {
    uploadMutation.mutate(
      { fileContent, fileName, fileType, forceImport },
      {
        onSuccess: (data) => {
          // Auto-select the newly uploaded import
          const newImportId = data?.import_id;
          if (newImportId) {
            setSelectedImport(newImportId);
          } else {
            setSelectedImport(null);
          }
        },
        onError: (err: any) => {
          if (err.isDuplicate) {
            setDuplicateDialog({ open: true, details: err.details, pendingUpload: { fileContent, fileName, fileType } });
          }
        },
      }
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["ofx", "csv", "xlsx", "xls"].includes(ext)) {
      toast.error("Formato não suportado. Use OFX, CSV ou Excel (.xlsx/.xls).");
      return;
    }
    if (ext === "xlsx" || ext === "xls") {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      doUpload(base64, file.name, ext);
    } else {
      const text = await file.text();
      doUpload(text, file.name, ext);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRunMatching = () => {
    if (!activeImportId) return;
    // Send undefined for consolidated view so edge function fetches ALL unmatched transactions
    const importIdParam = isConsolidatedView ? undefined : activeImportId;
    matchMutation.mutate(
      { importId: importIdParam },
      {
        onSuccess: (data) => {
          setMatchSuggestions(data.matches);
        },
      }
    );
  };

  const suggestionMap = useMemo(() => {
    const map = new Map<string, MatchSuggestion>();
    matchSuggestions.forEach((s) => map.set(s.transaction_id, s));
    return map;
  }, [matchSuggestions]);

  // Extract unique origins from transactions for the filter
  const availableOrigins = useMemo(() => {
    if (!transactions) return [];
    return extractUniqueOrigins(transactions);
  }, [transactions]);

  // Apply all filters
  const filteredTx = useMemo(() => {
    if (!transactions) return [];
    return applyTransactionFilters(transactions, filters);
  }, [transactions, filters]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [filters]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredTx.length / PAGE_SIZE));
  const paginatedTx = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredTx.slice(start, start + PAGE_SIZE);
  }, [filteredTx, currentPage]);

  const kpis = useMemo(() => {
    // Filter out balance entries from KPI calculations
    const data = filteredTx.filter((t) => !t.is_balance_entry);
    const credits = data.filter((t) => t.transaction_type === "credit").reduce((s, t) => s + t.amount_cents, 0);
    const debits = data.filter((t) => t.transaction_type === "debit").reduce((s, t) => s + Math.abs(t.amount_cents), 0);
    const unmatched = data.filter((t) => t.match_status === "unmatched").length;
    const matched = data.filter((t) => t.match_status === "auto_matched" || t.match_status === "manual_matched").length;
    return { credits, debits, unmatched, matched, total: data.length };
  }, [filteredTx]);

  const handleDismissSuggestion = useCallback((transactionId: string) => {
    setMatchSuggestions((prev) => prev.filter((s) => s.transaction_id !== transactionId));
  }, []);

  const handleIgnore = useCallback((txId: string) => {
    ignoreMutation.mutate(txId);
  }, [ignoreMutation]);

  return (
    <div>
      <PageHeader title="Conciliação Bancária" description="Importe extratos do banco e acompanhe as movimentações. A vinculação com despesas e repasses chega na próxima fase." />

      {/* Upload + Import selector */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input ref={fileInputRef} type="file" accept=".ofx,.csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
          {uploadMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Importar Extrato
        </Button>

        {visibleImports && visibleImports.length > 0 && (
          <Select value={activeImportId ?? ""} onValueChange={(v) => setSelectedImport(v)}>
            <SelectTrigger className="w-[320px]">
              <SelectValue placeholder="Selecione uma importação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">📊 Todas as importações</SelectItem>
              {visibleImports.map((imp) => (
                <SelectItem key={imp.id} value={imp.id}>
                  {imp.file_name} — {formatDate(imp.period_start)} a {formatDate(imp.period_end)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* O botão de excluir importação morreu na 2c-1 junto com o hook:
            apagava sem transação/lineage/backup. A exclusão volta na 2c-2
            como RPC bank_import_delete. */}

        {(activeImport || isConsolidatedView) && (
          <div className="flex gap-2 ml-auto">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" onClick={handleRunMatching} disabled={matchMutation.isPending}>
                    {matchMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                    Buscar Sugestões
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-center">
                  Compara as movimentações do extrato com despesas pendentes e mostra possíveis correspondências. Só informação: nada é vinculado nem quitado por aqui.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      {(activeImport || isConsolidatedView) && <BankKPIs kpis={kpis} />}

      {/* Filters */}
      {(activeImport || isConsolidatedView) && (
        <BankTransactionFilters
          filters={filters}
          onFiltersChange={setFilters}
          accounts={bankAccounts?.map((a) => ({ id: a.id, name: a.name })) ?? []}
          origins={availableOrigins}
        />
      )}

      {/* Transaction table */}
      {(activeImport || isConsolidatedView) && (
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
                <TableHead className="w-[100px]">Ações</TableHead>
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
                paginatedTx.map((tx) => (
                  <BankTransactionRow
                    key={tx.id}
                    tx={tx}
                    suggestion={suggestionMap.get(tx.id)}
                    onDismissSuggestion={handleDismissSuggestion}
                    onIgnore={handleIgnore}
                    onRestore={handleRestore}
                    isIgnorePending={ignoreMutation.isPending}
                    isRestorePending={restoreMutation.isPending}
                  />
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {filteredTx.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredTx.length)} de {filteredTx.length} transações
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm px-2">
                  {currentPage}/{totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!activeImport && !isConsolidatedView && !loadingImports && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Upload className="h-12 w-12 mb-4 opacity-40" />
          <p className="text-lg font-medium">Nenhuma importação encontrada</p>
          <p className="text-sm">Importe um extrato OFX ou CSV do seu banco para começar a conciliação.</p>
        </div>
      )}

      {/* Duplicate file confirmation dialog */}
      <AlertDialog open={duplicateDialog.open} onOpenChange={(open) => { if (!open) setDuplicateDialog(prev => ({ ...prev, open: false })); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivo já importado</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateDialog.details}
              <br /><br />
              Deseja importar novamente mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (duplicateDialog.pendingUpload) {
                const { fileContent, fileName, fileType } = duplicateDialog.pendingUpload;
                doUpload(fileContent, fileName, fileType, true);
              }
              setDuplicateDialog({ open: false, details: "", pendingUpload: null });
            }}>
              Importar novamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
