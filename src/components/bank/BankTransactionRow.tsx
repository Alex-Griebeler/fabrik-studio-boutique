import { X, EyeOff, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCents } from "@/hooks/usePlans";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { BankTransaction, MatchSuggestion } from "@/hooks/useBankReconciliation";

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
  unmatched: "Pendente",
  auto_matched: "Vinculado",
  manual_matched: "Vinculado",
  ignored: "Ignorado",
};

const matchStatusColors: Record<string, string> = {
  unmatched: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
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

interface BankTransactionRowProps {
  tx: BankTransaction;
  /**
   * Sugestão de correspondência (Onda 2c-1: SÓ informação — os botões de
   * aprovar/vincular morreram junto com o modelo que quitava; a vinculação
   * real chega por RPC na 2c-3/2c-5).
   */
  suggestion: MatchSuggestion | undefined;
  onDismissSuggestion: (transactionId: string) => void;
  onIgnore: (transactionId: string) => void;
  onRestore?: (transactionId: string) => void;
  isIgnorePending: boolean;
  isRestorePending?: boolean;
}

export function BankTransactionRow({
  tx,
  suggestion,
  onDismissSuggestion,
  onIgnore,
  onRestore,
  isIgnorePending,
  isRestorePending,
}: BankTransactionRowProps) {
  const hasSuggestion = !!suggestion && tx.match_status === "unmatched";

  return (
    <TableRow className={hasSuggestion ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}>
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
        {hasSuggestion && suggestion && (
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
        <Badge variant="outline" className={hasSuggestion ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" : (matchStatusColors[tx.match_status] ?? "")}>
          {hasSuggestion ? "Sugestão" : (matchStatusLabels[tx.match_status] ?? tx.match_status)}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {hasSuggestion && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Descartar sugestão"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => onDismissSuggestion(tx.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Descartar sugestão (só visual)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {tx.match_status === "unmatched" && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Ignorar transação"
                    className="h-7 w-7"
                    onClick={() => onIgnore(tx.id)}
                    disabled={isIgnorePending}
                  >
                    <EyeOff className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ignorar transação</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {tx.match_status === "ignored" && onRestore && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Restaurar para pendente"
                    className="h-7 w-7"
                    onClick={() => onRestore(tx.id)}
                    disabled={isRestorePending}
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Restaurar para pendente</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
