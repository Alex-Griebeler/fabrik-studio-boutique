import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useUpdateInvoice, invoiceStatusLabels, invoiceStatusColors, paymentTypeLabels, type Invoice } from "@/hooks/useInvoices";
import { paymentMethodLabels, activePaymentMethods } from "@/hooks/useContracts";
import { formatCents } from "@/hooks/usePlans";
import type { Database } from "@/integrations/supabase/types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: Invoice | null;
}

export function InvoiceFormDialog({ open, onOpenChange, invoice }: Props) {
  const updateInvoice = useUpdateInvoice();

  const [paymentDate, setPaymentDate] = useState("");
  const [paidAmountCents, setPaidAmountCents] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (invoice) {
      setPaymentDate(invoice.payment_date || new Date().toISOString().slice(0, 10));
      setPaidAmountCents(invoice.paid_amount_cents || invoice.amount_cents);
      setPaymentMethod(invoice.payment_method || "");
      setNotes(invoice.notes || "");
    }
  }, [invoice, open]);

  if (!invoice) return null;

  const canRegisterPayment = invoice.status === "pending" || invoice.status === "overdue" || invoice.status === "scheduled";
  const totalWithPenalties = invoice.amount_cents + (invoice.fine_amount_cents || 0) + (invoice.interest_amount_cents || 0);

  const handleRegisterPayment = () => {
    updateInvoice.mutate(
      {
        id: invoice.id,
        data: {
          status: "paid",
          payment_date: paymentDate,
          paid_amount_cents: paidAmountCents,
          payment_method: paymentMethod as PaymentMethod || undefined,
          notes: notes || undefined,
        },
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const handleCancel = () => {
    updateInvoice.mutate(
      {
        id: invoice.id,
        data: { status: "cancelled", notes: notes || undefined },
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {canRegisterPayment ? "Registrar Pagamento" : "Detalhes da Cobrança"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info summary */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Aluno</span>
              <span className="font-medium">{invoice.student?.full_name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <span>{invoice.payment_type ? paymentTypeLabels[invoice.payment_type] || invoice.payment_type : "—"}</span>
            </div>
            {invoice.installment_number && invoice.total_installments && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Parcela</span>
                <span>{invoice.installment_number}/{invoice.total_installments}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor Original</span>
              <span className="font-medium">{formatCents(invoice.amount_cents)}</span>
            </div>
            {(invoice.fine_amount_cents || 0) > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Multa</span>
                <span>{formatCents(invoice.fine_amount_cents || 0)}</span>
              </div>
            )}
            {(invoice.interest_amount_cents || 0) > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Juros</span>
                <span>{formatCents(invoice.interest_amount_cents || 0)}</span>
              </div>
            )}
            {totalWithPenalties !== invoice.amount_cents && (
              <div className="flex justify-between font-semibold border-t pt-1">
                <span>Total</span>
                <span>{formatCents(totalWithPenalties)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vencimento</span>
              <span>{invoice.due_date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className={invoiceStatusColors[invoice.status]}>
                {invoiceStatusLabels[invoice.status]}
              </Badge>
            </div>
          </div>

          {/* Register payment form */}
          {canRegisterPayment && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Data Pagamento</Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor Pago (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={(paidAmountCents / 100).toFixed(2)}
                    onChange={(e) => setPaidAmountCents(Math.round(parseFloat(e.target.value || "0") * 100))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Forma de Pagamento</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {activePaymentMethods.map((m) => (
                      <SelectItem key={m} value={m}>{paymentMethodLabels[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>

              <div className="flex justify-between pt-2">
                <Button type="button" variant="destructive" size="sm" onClick={handleCancel} disabled={updateInvoice.isPending}>
                  Cancelar Cobrança
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Fechar
                  </Button>
                  <Button onClick={handleRegisterPayment} disabled={updateInvoice.isPending}>
                    {updateInvoice.isPending ? "Salvando..." : "Confirmar Pagamento"}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Read-only for paid/cancelled */}
          {!canRegisterPayment && (
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
