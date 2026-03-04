import { useState, useMemo } from "react";
import { Filter, X, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BankTransaction } from "@/hooks/useBankReconciliation";
import type { BankImport } from "@/hooks/useBankReconciliation";

export interface TransactionFilters {
  status: string;
  accountId: string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  amountMin: string;
  amountMax: string;
  origin: string;
}

const INITIAL_FILTERS: TransactionFilters = {
  status: "all",
  accountId: "all",
  dateFrom: undefined,
  dateTo: undefined,
  amountMin: "",
  amountMax: "",
  origin: "all",
};

interface BankAccount {
  id: string;
  name: string;
}

interface Props {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  accounts: BankAccount[];
  origins: string[];
}

function detectOrigin(tx: BankTransaction): string {
  const memo = (tx.memo || "").toLowerCase();
  const parsedType = (tx.parsed_type || "").toLowerCase();
  
  if (memo.includes("rede") || parsedType.includes("rede") || memo.includes("redecard")) return "Rede";
  if (memo.includes("pix")) return "PIX";
  if (memo.includes("ted") || memo.includes("transf")) return "TED/Transferência";
  if (memo.includes("boleto") || memo.includes("cobranca")) return "Boleto";
  if (memo.includes("deb auto") || memo.includes("debito auto")) return "Débito Automático";
  if (memo.includes("cheque")) return "Cheque";
  return "Outros";
}

export function getTransactionOrigin(tx: BankTransaction): string {
  return detectOrigin(tx);
}

export function extractUniqueOrigins(transactions: BankTransaction[]): string[] {
  const origins = new Set<string>();
  transactions.forEach((tx) => origins.add(detectOrigin(tx)));
  return Array.from(origins).sort();
}

export function applyTransactionFilters(
  transactions: BankTransaction[],
  filters: TransactionFilters
): BankTransaction[] {
  let result = transactions;

  // Status filter
  if (filters.status === "credit") {
    result = result.filter((t) => t.transaction_type === "credit");
  } else if (filters.status === "debit") {
    result = result.filter((t) => t.transaction_type === "debit");
  } else if (filters.status !== "all") {
    result = result.filter((t) => t.match_status === filters.status);
  }

  // Date range filter
  if (filters.dateFrom) {
    const from = format(filters.dateFrom, "yyyy-MM-dd");
    result = result.filter((t) => t.posted_date >= from);
  }
  if (filters.dateTo) {
    const to = format(filters.dateTo, "yyyy-MM-dd");
    result = result.filter((t) => t.posted_date <= to);
  }

  // Amount range filter
  if (filters.amountMin) {
    const minCents = Math.round(parseFloat(filters.amountMin.replace(",", ".")) * 100);
    if (!isNaN(minCents)) {
      result = result.filter((t) => Math.abs(t.amount_cents) >= minCents);
    }
  }
  if (filters.amountMax) {
    const maxCents = Math.round(parseFloat(filters.amountMax.replace(",", ".")) * 100);
    if (!isNaN(maxCents)) {
      result = result.filter((t) => Math.abs(t.amount_cents) <= maxCents);
    }
  }

  // Origin filter
  if (filters.origin !== "all") {
    result = result.filter((t) => detectOrigin(t) === filters.origin);
  }

  return result;
}

export function filterImportsByAccount(
  imports: BankImport[],
  accountId: string
): BankImport[] {
  if (accountId === "all") return imports;
  return imports.filter((imp) => imp.account_id === accountId);
}

export { INITIAL_FILTERS };

export function BankTransactionFilters({ filters, onFiltersChange, accounts, origins }: Props) {
  const activeCount = useMemo(() => {
    let count = 0;
    if (filters.status !== "all") count++;
    if (filters.accountId !== "all") count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    if (filters.amountMin) count++;
    if (filters.amountMax) count++;
    if (filters.origin !== "all") count++;
    return count;
  }, [filters]);

  const update = (partial: Partial<TransactionFilters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const clearAll = () => onFiltersChange(INITIAL_FILTERS);

  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Filtros</span>
        {activeCount > 0 && (
          <>
            <Badge variant="secondary" className="text-xs">
              {activeCount} ativo{activeCount > 1 ? "s" : ""}
            </Badge>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>
              <X className="h-3 w-3 mr-1" /> Limpar
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {/* Status */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={filters.status} onValueChange={(v) => update({ status: v })}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="credit">Créditos</SelectItem>
              <SelectItem value="debit">Débitos</SelectItem>
              <SelectItem value="unmatched">Pendentes</SelectItem>
              <SelectItem value="auto_matched">Vinculados (auto)</SelectItem>
              <SelectItem value="manual_matched">Vinculados (manual)</SelectItem>
              <SelectItem value="ignored">Ignorados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Conta bancária */}
        {accounts.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Conta</Label>
            <Select value={filters.accountId} onValueChange={(v) => update({ accountId: v })}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as contas</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Data de/até */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">De</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-[130px] h-9 justify-start text-left font-normal text-sm", !filters.dateFrom && "text-muted-foreground")}
              >
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                {filters.dateFrom ? format(filters.dateFrom, "dd/MM/yyyy") : "Início"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateFrom}
                onSelect={(d) => update({ dateFrom: d })}
                locale={ptBR}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Até</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-[130px] h-9 justify-start text-left font-normal text-sm", !filters.dateTo && "text-muted-foreground")}
              >
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                {filters.dateTo ? format(filters.dateTo, "dd/MM/yyyy") : "Fim"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateTo}
                onSelect={(d) => update({ dateTo: d })}
                locale={ptBR}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Valor mín/máx */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Valor mín (R$)</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            className="w-[100px] h-9 text-sm"
            value={filters.amountMin}
            onChange={(e) => update({ amountMin: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Valor máx (R$)</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            className="w-[100px] h-9 text-sm"
            value={filters.amountMax}
            onChange={(e) => update({ amountMax: e.target.value })}
          />
        </div>

        {/* Origem */}
        {origins.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Origem</Label>
            <Select value={filters.origin} onValueChange={(v) => update({ origin: v })}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {origins.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
