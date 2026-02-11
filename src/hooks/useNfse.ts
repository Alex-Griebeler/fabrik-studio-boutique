import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export interface Nfse {
  id: string;
  invoice_id: string;
  student_id: string | null;
  contract_id: string | null;
  nfse_number: string | null;
  external_id: string | null;
  status: "pending" | "processing" | "authorized" | "cancelled" | "error";
  amount_cents: number;
  service_description: string;
  tomador_nome: string;
  tomador_cpf: string | null;
  tomador_email: string | null;
  tomador_endereco: Record<string, unknown> | null;
  authorization_date: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  verification_code: string | null;
  error_message: string | null;
  api_response: Record<string, unknown> | null;
  email_sent: boolean;
  email_sent_at: string | null;
  email_sent_to: string[] | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export const nfseStatusLabels: Record<Nfse["status"], string> = {
  pending: "Pendente",
  processing: "Processando",
  authorized: "Autorizada",
  cancelled: "Cancelada",
  error: "Erro",
};

export const nfseStatusColors: Record<Nfse["status"], string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  authorized: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-muted text-muted-foreground",
  error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export function useNfseList(statusFilter: "all" | Nfse["status"] = "all") {
  return useQuery({
    queryKey: ["nfse", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("nfse")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Nfse[];
    },
  });
}

export function useEmitNfse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.functions.invoke("emit-nfse", {
        body: { invoice_id: invoiceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["nfse"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      if (data?.mock) {
        toast.success("NF-e emitida em modo simulação (sem API Focusnfe)");
      } else {
        toast.success("NF-e enviada para processamento!");
      }
    },
    onError: (err: Error) => {
      toast.error(`Erro ao emitir NF-e: ${err.message}`);
    },
  });
}

export function useCancelNfse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from("nfse")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
        } satisfies Database["public"]["Tables"]["nfse"]["Update"])
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nfse"] });
      toast.success("NF-e cancelada.");
    },
    onError: () => toast.error("Erro ao cancelar NF-e."),
  });
}

export function useRetryNfse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nfse: Nfse) => {
      // Delete old errored entry, re-emit
      await supabase.from("nfse").delete().eq("id", nfse.id);
      const { data, error } = await supabase.functions.invoke("emit-nfse", {
        body: { invoice_id: nfse.invoice_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["nfse"] });
      if (data?.mock) {
        toast.success("NF-e re-emitida em modo simulação");
      } else {
        toast.success("NF-e reenviada para processamento!");
      }
    },
    onError: (err: Error) => {
      toast.error(`Erro ao reemitir NF-e: ${err.message}`);
    },
  });
}
