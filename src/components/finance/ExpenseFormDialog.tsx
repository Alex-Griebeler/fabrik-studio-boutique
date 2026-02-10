import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateExpense,
  useUpdateExpense,
  useExpenseCategories,
  expenseStatusLabels,
  type Expense,
  type ExpenseFormData,
  type ExpenseStatus,
} from "@/hooks/useExpenses";
import { paymentMethodLabels } from "@/hooks/useContracts";
import type { Database } from "@/integrations/supabase/types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];
const paymentMethods: PaymentMethod[] = ["pix", "credit_card", "debit_card", "boleto", "cash", "transfer"];
const statuses: ExpenseStatus[] = ["pending", "paid", "cancelled"];
const recurrenceLabels: Record<string, string> = {
  none: "Sem recorrência",
  monthly: "Mensal",
  weekly: "Semanal",
  yearly: "Anual",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
}

export function ExpenseFormDialog({ open, onOpenChange, expense }: Props) {
  const { data: categories } = useExpenseCategories();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();

  const [form, setForm] = useState<ExpenseFormData>({
    category_id: "",
    description: "",
    amount_cents: 0,
    due_date: new Date().toISOString().slice(0, 10),
    status: "pending",
    recurrence: "none",
    notes: "",
  });

  useEffect(() => {
    if (expense) {
      setForm({
        category_id: expense.category_id,
        description: expense.description,
        amount_cents: expense.amount_cents,
        due_date: expense.due_date,
        payment_date: expense.payment_date || "",
        status: expense.status,
        payment_method: expense.payment_method || undefined,
        recurrence: expense.recurrence || "none",
        notes: expense.notes || "",
      });
    } else {
      setForm({
        category_id: "",
        description: "",
        amount_cents: 0,
        due_date: new Date().toISOString().slice(0, 10),
        status: "pending",
        recurrence: "none",
        notes: "",
      });
    }
  }, [expense, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (expense) {
      updateExpense.mutate({ id: expense.id, data: form }, { onSuccess: () => onOpenChange(false) });
    } else {
      createExpense.mutate(form, { onSuccess: () => onOpenChange(false) });
    }
  };

  const isPending = createExpense.isPending || updateExpense.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar Despesa" : "Nova Despesa"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div className="space-y-1.5">
            <Label>Categoria *</Label>
            <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
              <SelectContent>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ex: Aluguel do espaço"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={(form.amount_cents / 100).toFixed(2)}
                onChange={(e) => setForm({ ...form, amount_cents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento *</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status || "pending"} onValueChange={(v) => setForm({ ...form, status: v as ExpenseStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>{expenseStatusLabels[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Recorrência</Label>
              <Select value={form.recurrence || "none"} onValueChange={(v) => setForm({ ...form, recurrence: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(recurrenceLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.status === "paid" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data Pagamento</Label>
                <Input type="date" value={form.payment_date || ""} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Forma Pagamento</Label>
                <Select value={form.payment_method || ""} onValueChange={(v) => setForm({ ...form, payment_method: v as PaymentMethod })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((m) => (
                      <SelectItem key={m} value={m}>{paymentMethodLabels[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending || !form.category_id || !form.description}>
              {isPending ? "Salvando..." : expense ? "Salvar" : "Criar Despesa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
