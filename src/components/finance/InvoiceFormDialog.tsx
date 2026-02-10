import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateInvoice, useUpdateInvoice, invoiceStatusLabels, type Invoice, type InvoiceFormData } from "@/hooks/useInvoices";
import { useContracts, paymentMethodLabels } from "@/hooks/useContracts";
import type { Database } from "@/integrations/supabase/types";

type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
const paymentMethods: PaymentMethod[] = ["pix", "credit_card", "debit_card", "boleto", "cash", "transfer"];
const statuses: InvoiceStatus[] = ["pending", "paid", "overdue", "cancelled"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: Invoice | null;
}

export function InvoiceFormDialog({ open, onOpenChange, invoice }: Props) {
  const { data: contracts } = useContracts("active");
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();

  const [form, setForm] = useState<InvoiceFormData>({
    contract_id: "",
    amount_cents: 0,
    due_date: new Date().toISOString().slice(0, 10),
    status: "pending",
    reference_month: "",
    payment_date: "",
    paid_amount_cents: undefined,
    payment_method: undefined,
    notes: "",
  });

  useEffect(() => {
    if (invoice) {
      setForm({
        contract_id: invoice.contract_id,
        student_id: invoice.student_id || undefined,
        amount_cents: invoice.amount_cents,
        due_date: invoice.due_date,
        status: invoice.status,
        reference_month: invoice.reference_month || "",
        payment_date: invoice.payment_date || "",
        paid_amount_cents: invoice.paid_amount_cents || undefined,
        payment_method: invoice.payment_method || undefined,
        notes: invoice.notes || "",
      });
    } else {
      setForm({
        contract_id: "",
        amount_cents: 0,
        due_date: new Date().toISOString().slice(0, 10),
        status: "pending",
        reference_month: "",
        payment_date: "",
        paid_amount_cents: undefined,
        payment_method: undefined,
        notes: "",
      });
    }
  }, [invoice, open]);

  // Auto-fill student_id and amount when contract changes
  useEffect(() => {
    if (form.contract_id && contracts && !invoice) {
      const c = contracts.find((ct) => ct.id === form.contract_id);
      if (c) {
        setForm((prev) => ({
          ...prev,
          student_id: c.student_id,
          amount_cents: (c.monthly_value_cents || 0) - (c.discount_cents || 0),
        }));
      }
    }
  }, [form.contract_id, contracts, invoice]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (invoice) {
      updateInvoice.mutate({ id: invoice.id, data: form }, { onSuccess: () => onOpenChange(false) });
    } else {
      createInvoice.mutate(form, { onSuccess: () => onOpenChange(false) });
    }
  };

  const isPending = createInvoice.isPending || updateInvoice.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{invoice ? "Editar Fatura" : "Nova Fatura"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Contract */}
          <div className="space-y-1.5">
            <Label>Contrato *</Label>
            <Select value={form.contract_id} onValueChange={(v) => setForm({ ...form, contract_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o contrato" /></SelectTrigger>
              <SelectContent>
                {contracts?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.student?.full_name} — {c.plan?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <Label>Mês Referência</Label>
              <Input
                type="month"
                value={form.reference_month || ""}
                onChange={(e) => setForm({ ...form, reference_month: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vencimento *</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status || "pending"} onValueChange={(v) => setForm({ ...form, status: v as InvoiceStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>{invoiceStatusLabels[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Payment info (shown when marking as paid) */}
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
            <Button type="submit" disabled={isPending || !form.contract_id}>
              {isPending ? "Salvando..." : invoice ? "Salvar" : "Criar Fatura"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
