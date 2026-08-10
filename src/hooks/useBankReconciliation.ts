import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BankImport {
  id: string;
  file_name: string;
  file_type: string;
  bank_id: string | null;
  account_id: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string;
  total_transactions: number | null;
  total_credits_cents: number | null;
  total_debits_cents: number | null;
  error_message: string | null;
  created_at: string;
}

export interface BankTransaction {
  id: string;
  import_id: string;
  fit_id: string;
  transaction_type: string;
  posted_date: string;
  amount_cents: number;
  memo: string;
  parsed_type: string | null;
  parsed_name: string | null;
  parsed_document: string | null;
  is_balance_entry: boolean | null;
  match_status: string;
  match_confidence: string | null;
  matched_invoice_id: string | null;
  matched_expense_id: string | null;
}

export interface MatchSuggestion {
  transaction_id: string;
  matched_type: "invoice" | "expense";
  matched_id: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface MatchResult {
  success: boolean;
  matches: MatchSuggestion[];
  stats: {
    total_transactions: number;
    total_matches: number;
    high_confidence: number;
    medium_confidence: number;
    low_confidence: number;
  };
}

export function useBankImports() {
  return useQuery({
    queryKey: ["bank-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_imports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as BankImport[];
    },
  });
}

export function useBankTransactions(importId: string | null) {
  const isAll = importId === "__all__";
  return useQuery({
    queryKey: ["bank-transactions", importId],
    enabled: !!importId,
    queryFn: async () => {
      let query = supabase
        .from("bank_transactions")
        .select("*")
        .order("posted_date", { ascending: false })
        .limit(1000);
      if (!isAll) {
        query = query.eq("import_id", importId!);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as BankTransaction[];
    },
  });
}

export function useUploadBankStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fileContent, fileName, fileType, forceImport }: { fileContent: string; fileName: string; fileType: string; forceImport?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("parse-bank-statement", {
        body: { fileContent, fileName, fileType: fileType === "xls" ? "xlsx" : fileType, forceImport: forceImport ?? false },
      });
      if (error) {
        // Check for 409 duplicate response embedded in FunctionsHttpError
        if ((error as any)?.context?.status === 409 || (error as any)?.status === 409) {
          const dupError = new Error("Arquivo duplicado") as any;
          dupError.isDuplicate = true;
          dupError.details = data?.details || "Este arquivo já foi importado anteriormente.";
          throw dupError;
        }
        throw error;
      }
      if (data?.error) {
        if (data.error === "Arquivo duplicado") {
          const dupError = new Error("Arquivo duplicado") as any;
          dupError.isDuplicate = true;
          dupError.details = data.details || "Este arquivo já foi importado anteriormente.";
          throw dupError;
        }
        throw new Error(data.error);
      }
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["bank-imports"] });
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      const s = data?.summary;
      toast.success(`Importação concluída! ${s?.total_transactions ?? 0} transações processadas.`);
    },
    onError: (err: any) => {
      if (!err.isDuplicate) {
        toast.error(`Erro na importação: ${err.message}`);
      }
    },
  });
}

/**
 * Busca sugestões de vínculo. Desde a Onda 2c-1 a edge function é
 * somente-sugestão: nenhuma escrita acontece em nenhum caminho — aplicar
 * vínculo vira RPC transacional na 2c-3. Por isso este hook não invalida
 * mais invoices/expenses: nada muda ao rodar.
 */
export function useRunMatching() {
  return useMutation({
    mutationFn: async ({ importId }: { importId?: string }) => {
      const { data, error } = await supabase.functions.invoke("match-bank-transactions", {
        body: { import_id: importId ?? null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as MatchResult;
    },
    onSuccess: (data) => {
      const s = data.stats;
      if (s.total_matches === 0) {
        toast.info("Nenhuma sugestão encontrada para as transações pendentes.");
      } else {
        toast.success(
          `${s.total_matches} sugestões encontradas (${s.high_confidence} alta, ${s.medium_confidence} média, ${s.low_confidence} baixa). A vinculação chega na próxima fase da conciliação.`
        );
      }
    },
    onError: (err: Error) => {
      toast.error(`Erro ao buscar sugestões: ${err.message}`);
    },
  });
}

export function useIgnoreTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase
        .from("bank_transactions")
        .update({ match_status: "ignored" })
        .eq("id", transactionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast.success("Transação ignorada.");
    },
    onError: () => toast.error("Erro ao ignorar transação."),
  });
}

export function useRestoreTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase
        .from("bank_transactions")
        .update({ match_status: "unmatched" })
        .eq("id", transactionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast.success("Transação restaurada para pendente.");
    },
    onError: () => toast.error("Erro ao restaurar transação."),
  });
}

// useDeleteBankImport morreu na 2c-1: apagava transações e import em duas
// chamadas client-side sem transação, sem lineage e sem backup — e permitia
// apagar os 6 imports legados ANTES do backup obrigatório da limpeza (A6).
// A exclusão volta na 2c-2 como RPC `bank_import_delete`, que recusa import
// com vínculo; os legados só saem pelo runbook da 2c-6.

// Os hooks useApproveMatch / useRejectMatch / useBatchApproveMatches morreram
// na Onda 2c-1. Eram o modelo velho: aprovar QUITAVA a fatura/despesa em
// escritas client-side sem transação, e rejeitar limpava a transação sem
// desfazer a quitação (bug C3 — 1 crédito podia pagar 2 faturas). O modelo
// novo (aprovar = vincular, por RPC transacional) chega na 2c-3.
