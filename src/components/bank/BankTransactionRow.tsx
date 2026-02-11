import { Check, X, EyeOff, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  suggested: "Verificar",
  auto_matched: "Vinculado",
  manual_matched: "Vinculado",
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

interface BankTransactionRowProps {
  tx: BankTransaction;
  suggestion: MatchSuggestion | undefined;
  showCheckbox: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onApprove: (suggestion: MatchSuggestion) => void;
  onReject: (transactionId: string) => void;
  onManualMatch: (tx: BankTransaction) => void;
  onIgnore: (transactionId: string) => void;
  isApprovePending: boolean;
  isIgnorePending: boolean;
}

export function BankTransactionRow({
  tx,
  suggestion,
  showCheckbox,
  isSelected,
  onToggleSelect,
  onApprove,
  onReject,
  onManualMatch,
  onIgnore,
  isApprovePending,
  isIgnorePending,
}: BankTransactionRowProps) {
  const hasSuggestion = !!suggestion && tx.match_status === "unmatched";

  return (
    <TableRow className={hasSuggestion ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}>
      {showCheckbox && (
        <TableCell>
          {hasSuggestion && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(tx.id)}
            />
          )}
        </TableCell>
      )}
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
        <Badge variant="outline" className={hasSuggestion ? matchStatusColors.suggested : (matchStatusColors[tx.match_status] ?? "")}>
          {hasSuggestion ? "Sugestão" : (matchStatusLabels[tx.match_status] ?? tx.match_status)}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {hasSuggestion && suggestion && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                      onClick={() => onApprove(suggestion)}
                      disabled={isApprovePending}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Confirmar vínculo com {suggestion.matched_type === "invoice" ? "fatura" : "despesa"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                      onClick={() => onReject(tx.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Descartar sugestão</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
          {tx.match_status === "unmatched" && !hasSuggestion && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => onManualMatch(tx)}
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Vincular manualmente a uma fatura ou despesa</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
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
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
