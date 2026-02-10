import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

// Expense status — matches the DB enum
export type ExpenseStatus = "pending" | "paid" | "cancelled";

export const expenseStatusLabels: Record<ExpenseStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  cancelled: "Cancelado",
};

export const expenseStatusColors: Record<ExpenseStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-muted text-muted-foreground",
};

export interface ExpenseCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  is_active: boolean;
  sort_order: number;
}

export interface Expense {
  id: string;
  category_id: string;
  description: string;
  amount_cents: number;
  due_date: string;
  payment_date: string | null;
  status: ExpenseStatus;
  payment_method: PaymentMethod | null;
  recurrence: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  category?: { name: string; color: string };
}

export interface ExpenseFormData {
  category_id: string;
  description: string;
  amount_cents: number;
  due_date: string;
  payment_date?: string;
  status?: ExpenseStatus;
  payment_method?: PaymentMethod;
  recurrence?: string;
  notes?: string;
}

/* ── Categories ── */

export function useExpenseCategories() {
  return useQuery({
    queryKey: ["expense_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as ExpenseCategory[];
    },
  });
}

/* ── Expenses ── */

export function useExpenses(statusFilter: "all" | ExpenseStatus = "all") {
  return useQuery({
    queryKey: ["expenses", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("expenses")
        .select("*, category:expense_categories(name, color)")
        .order("due_date", { ascending: false });

      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Expense[];
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: ExpenseFormData) => {
      const { error } = await supabase.from("expenses").insert({
        category_id: data.category_id,
        description: data.description,
        amount_cents: data.amount_cents,
        due_date: data.due_date,
        payment_date: data.payment_date || null,
        status: data.status ?? "pending",
        payment_method: data.payment_method ?? null,
        recurrence: data.recurrence ?? "none",
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Despesa criada com sucesso!");
    },
    onError: () => toast.error("Erro ao criar despesa."),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ExpenseFormData> }) => {
      const { error } = await supabase.from("expenses").update({
        ...data,
        payment_date: data.payment_date || null,
        notes: data.notes || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Despesa atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar despesa."),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Despesa excluída!");
    },
    onError: () => toast.error("Erro ao excluir despesa."),
  });
}
