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

export function useBankImports() {
  return useQuery({
    queryKey: ["bank-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_imports")
        .select("*")
        .order("created_at", { ascending: false });
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
        .order("posted_date", { ascending: false });
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
