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
    auto_applied: number;
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
  return useQuery({
    queryKey: ["bank-transactions", importId],
    enabled: !!importId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*")
        .eq("import_id", importId!)
        .order("posted_date", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data as BankTransaction[];
    },
  });
}

export function useUploadBankStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fileContent, fileName }: { fileContent: string; fileName: string }) => {
      const { data, error } = await supabase.functions.invoke("parse-bank-statement", {
        body: { fileContent, fileName, fileType: "ofx" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["bank-imports"] });
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      const s = data?.summary;
      toast.success(`Importação concluída! ${s?.total_transactions ?? 0} transações processadas.`);
    },
    onError: (err: Error) => {
      toast.error(`Erro na importação: ${err.message}`);
    },
  });
}

export function useRunMatching() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ importId, autoApply }: { importId?: string; autoApply?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("match-bank-transactions", {
        body: { import_id: importId ?? null, auto_apply: autoApply ?? false },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as MatchResult;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      const s = data.stats;
      if (s.total_matches === 0) {
        toast.info("Nenhum match encontrado para as transações pendentes.");
      } else {
        toast.success(
          `${s.total_matches} matches encontrados! (${s.high_confidence} alta, ${s.medium_confidence} média, ${s.low_confidence} baixa)${s.auto_applied > 0 ? ` — ${s.auto_applied} aplicados automaticamente` : ""}`
        );
      }
    },
    onError: (err: Error) => {
      toast.error(`Erro no matching: ${err.message}`);
    },
  });
}

export function useApproveMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ transactionId, matchedType, matchedId }: { transactionId: string; matchedType: "invoice" | "expense"; matchedId: string }) => {
      const updateData: Record<string, unknown> = {
        match_status: "manual_matched",
        match_confidence: "manual",
        matched_at: new Date().toISOString(),
      };
      if (matchedType === "invoice") {
        updateData.matched_invoice_id = matchedId;
      } else {
        updateData.matched_expense_id = matchedId;
      }
      const { error } = await supabase
        .from("bank_transactions")
        .update(updateData)
        .eq("id", transactionId);
      if (error) throw error;

      // Update matched record
      if (matchedType === "invoice") {
        const { data: tx } = await supabase.from("bank_transactions").select("posted_date").eq("id", transactionId).maybeSingle();
        await supabase.from("invoices").update({ status: "paid", payment_date: tx?.posted_date }).eq("id", matchedId);
      } else {
        const { data: tx } = await supabase.from("bank_transactions").select("posted_date").eq("id", transactionId).maybeSingle();
        await supabase.from("expenses").update({ status: "paid", payment_date: tx?.posted_date }).eq("id", matchedId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Match aprovado!");
    },
    onError: () => toast.error("Erro ao aprovar match."),
  });
}

export function useRejectMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase
        .from("bank_transactions")
        .update({
          match_status: "unmatched",
          match_confidence: null,
          matched_invoice_id: null,
          matched_expense_id: null,
          matched_at: null,
          matched_by: null,
        })
        .eq("id", transactionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast.success("Match rejeitado.");
    },
    onError: () => toast.error("Erro ao rejeitar match."),
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

export function useBatchApproveMatches() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (suggestions: MatchSuggestion[]) => {
      for (const s of suggestions) {
        const updateData: Record<string, unknown> = {
          match_status: "manual_matched",
          match_confidence: "manual",
          matched_at: new Date().toISOString(),
        };
        if (s.matched_type === "invoice") {
          updateData.matched_invoice_id = s.matched_id;
        } else {
          updateData.matched_expense_id = s.matched_id;
        }
        const { error } = await supabase
          .from("bank_transactions")
          .update(updateData)
          .eq("id", s.transaction_id);
        if (error) throw error;

        const { data: tx } = await supabase
          .from("bank_transactions")
          .select("posted_date")
          .eq("id", s.transaction_id)
          .maybeSingle();

        if (s.matched_type === "invoice") {
          await supabase.from("invoices").update({ status: "paid", payment_date: tx?.posted_date }).eq("id", s.matched_id);
        } else {
          await supabase.from("expenses").update({ status: "paid", payment_date: tx?.posted_date }).eq("id", s.matched_id);
        }
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(`${variables.length} matches aprovados em lote!`);
    },
    onError: () => toast.error("Erro ao aprovar matches em lote."),
  });
}
