import { Wand2, CheckSquare, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MatchSuggestion } from "@/hooks/useBankReconciliation";

interface BankSuggestionsBannerProps {
  suggestions: MatchSuggestion[];
  selectedCount: number;
  selectableSuggestions: MatchSuggestion[];
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onBatchApprove: () => void;
  isBatchPending: boolean;
}

export function BankSuggestionsBanner({
  suggestions,
  selectedCount,
  selectableSuggestions,
  allSelected,
  onToggleSelectAll,
  onBatchApprove,
  isBatchPending,
}: BankSuggestionsBannerProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
            {suggestions.length} possíveis vínculos encontrados
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {selectedCount} selecionadas
          </span>
          <Button size="sm" variant="outline" onClick={onToggleSelectAll}>
            <CheckSquare className="h-4 w-4 mr-1" />
            {allSelected ? "Desmarcar todas" : "Selecionar todas"}
          </Button>
          <Button
            size="sm"
            onClick={onBatchApprove}
            disabled={selectedCount === 0 || isBatchPending}
          >
            {isBatchPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
            Aprovar selecionadas ({selectedCount})
          </Button>
        </div>
      </div>
      <p className="text-xs text-blue-600 dark:text-blue-400">
        Revise os vínculos sugeridos. Marque os corretos e confirme em lote, ou confirme/descarte um por um.
      </p>
    </div>
  );
}
