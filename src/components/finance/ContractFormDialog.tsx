import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  useCreateContract,
  useUpdateContract,
  paymentMethodLabels,
  activePaymentMethods,
  durationToInstallments,
  type Contract,
  type ContractFormData,
} from "@/hooks/useContracts";
import { useStudents } from "@/hooks/useStudents";
import { usePlans, formatCents, categoryLabels, durationLabels } from "@/hooks/usePlans";
import type { Database } from "@/integrations/supabase/types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract?: Contract | null;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().substring(0, 10);
}

export function ContractFormDialog({ open, onOpenChange, contract }: Props) {
  const { data: students } = useStudents("", "all");
  const { data: plans } = usePlans("all", true);
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();

  const [form, setForm] = useState<ContractFormData>({
    student_id: "",
    plan_id: "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    total_value_cents: 0,
    discount_cents: 0,
    payment_method: undefined,
    installments: 1,
    card_last_four: "",
    card_brand: "",
    notes: "",
  });

  const [installmentDates, setInstallmentDates] = useState<string[]>([]);
  const [machineInstallments, setMachineInstallments] = useState<number>(1);

  const selectedPlan = useMemo(
    () => plans?.find((p) => p.id === form.plan_id),
    [form.plan_id, plans]
  );

  const netValue = useMemo(() => {
    return (form.total_value_cents || 0) - (form.discount_cents || 0);
  }, [form.total_value_cents, form.discount_cents]);

  const installmentValue = useMemo(() => {
    const n = form.installments || 1;
    if (n <= 0 || netValue <= 0) return 0;
    return Math.round(netValue / n);
  }, [netValue, form.installments]);

  const showInstallments = form.payment_method === "dcc" || form.payment_method === "pix";

  // Reset form
  useEffect(() => {
    if (contract) {
      setForm({
        student_id: contract.student_id,
        plan_id: contract.plan_id,
        start_date: contract.start_date,
        end_date: contract.end_date || "",
        status: contract.status,
        total_value_cents: contract.total_value_cents || contract.monthly_value_cents || 0,
        discount_cents: contract.discount_cents || 0,
        payment_method: contract.payment_method || undefined,
        installments: contract.installments || 1,
        card_last_four: contract.card_last_four || "",
        card_brand: contract.card_brand || "",
        notes: contract.notes || "",
      });
    } else {
      setForm({
        student_id: "",
        plan_id: "",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: "",
        total_value_cents: 0,
        discount_cents: 0,
        payment_method: undefined,
        installments: 1,
        card_last_four: "",
        card_brand: "",
        notes: "",
      });
      setInstallmentDates([]);
      setMachineInstallments(1);
    }
  }, [contract, open]);

  // Auto-fill value and installments when plan changes
  useEffect(() => {
    if (selectedPlan && !contract) {
      setForm((prev) => ({
        ...prev,
        total_value_cents: selectedPlan.price_cents,
        installments:
          prev.payment_method === "dcc"
            ? durationToInstallments[selectedPlan.duration] || 1
            : prev.installments,
      }));
    }
  }, [selectedPlan, contract]);

  // Auto-set installments when payment method changes to DCC
  useEffect(() => {
    if (form.payment_method === "dcc" && selectedPlan && !contract) {
      setForm((prev) => ({
        ...prev,
        installments: durationToInstallments[selectedPlan.duration] || 1,
      }));
    } else if (form.payment_method === "pix" && !contract) {
      setForm((prev) => ({ ...prev, installments: 1 }));
    }
  }, [form.payment_method, selectedPlan, contract]);

  // Generate installment dates when installments or start_date changes
  useEffect(() => {
    if (!showInstallments) {
      setInstallmentDates([]);
      return;
    }
    const n = form.installments || 1;
    const start = new Date(form.start_date + "T00:00:00");
    const dates: string[] = [];
    for (let i = 0; i < n; i++) {
      dates.push(toDateStr(addDays(start, i * 30)));
    }
    setInstallmentDates(dates);
  }, [form.installments, form.start_date, showInstallments]);

  const handleInstallmentDateChange = (index: number, value: string) => {
    setInstallmentDates((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (contract) {
      updateContract.mutate(
        { id: contract.id, data: form },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createContract.mutate(
        { ...form, installment_dates: installmentDates },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const isPending = createContract.isPending || updateContract.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contract ? "Editar Contrato" : "Novo Contrato"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Aluno */}
          <div className="space-y-1.5">
            <Label>Aluno *</Label>
            <Select
              value={form.student_id}
              onValueChange={(v) => setForm({ ...form, student_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o aluno" />
              </SelectTrigger>
              <SelectContent>
                {students?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Plano */}
          <div className="space-y-1.5">
            <Label>Plano *</Label>
            <Select
              value={form.plan_id}
              onValueChange={(v) => setForm({ ...form, plan_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o plano" />
              </SelectTrigger>
              <SelectContent>
                {plans?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {formatCents(p.price_cents)} ({categoryLabels[p.category]}) — {durationLabels[p.duration]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data Início *</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data Fim</Label>
              <Input
                type="date"
                value={form.end_date || ""}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
          </div>

          {/* Valores */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor Total (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={((form.total_value_cents || 0) / 100).toFixed(2)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    total_value_cents: Math.round(parseFloat(e.target.value || "0") * 100),
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Desconto (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={((form.discount_cents || 0) / 100).toFixed(2)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    discount_cents: Math.round(parseFloat(e.target.value || "0") * 100),
                  })
                }
              />
            </div>
          </div>

          {netValue > 0 && (
            <p className="text-sm text-muted-foreground">
              Valor líquido: <span className="font-semibold text-foreground">{formatCents(netValue)}</span>
            </p>
          )}

          {/* Forma de Pagamento */}
          <div className="space-y-1.5">
            <Label>Forma de Pagamento *</Label>
            <Select
              value={form.payment_method || ""}
              onValueChange={(v) => setForm({ ...form, payment_method: v as PaymentMethod })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {activePaymentMethods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {paymentMethodLabels[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── DCC Fields ── */}
          {form.payment_method === "dcc" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Últimos 4 dígitos</Label>
                  <Input
                    maxLength={4}
                    value={form.card_last_four || ""}
                    onChange={(e) => setForm({ ...form, card_last_four: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    placeholder="1234"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Bandeira</Label>
                  <Select
                    value={form.card_brand || ""}
                    onValueChange={(v) => setForm({ ...form, card_brand: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Visa">Visa</SelectItem>
                      <SelectItem value="Mastercard">Mastercard</SelectItem>
                      <SelectItem value="Elo">Elo</SelectItem>
                      <SelectItem value="Amex">Amex</SelectItem>
                      <SelectItem value="Hipercard">Hipercard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {/* ── Card Machine (informativo) ── */}
          {form.payment_method === "card_machine" && (
            <div className="space-y-1.5">
              <Label>Parcelas na Máquina (informativo)</Label>
              <Input
                type="number"
                min={1}
                max={18}
                value={machineInstallments}
                onChange={(e) => setMachineInstallments(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">
                O parcelamento é controlado pela máquina. Este campo é apenas informativo.
              </p>
            </div>
          )}

          {/* ── Installments (DCC & PIX) ── */}
          {showInstallments && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <Label>Número de Parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={form.installments || 1}
                  onChange={(e) =>
                    setForm({ ...form, installments: parseInt(e.target.value) || 1 })
                  }
                />
                {installmentValue > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {form.installments}x de {formatCents(installmentValue)}
                  </p>
                )}
              </div>

              {/* Installment dates preview */}
              {installmentDates.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Cronograma de Parcelas</Label>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-lg border bg-muted/30 p-3">
                    {installmentDates.map((date, i) => {
                      const isLast = i === installmentDates.length - 1;
                      const amount = isLast
                        ? netValue - installmentValue * (installmentDates.length - 1)
                        : installmentValue;
                      return (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground w-16 shrink-0">
                            {i + 1}/{installmentDates.length}
                          </span>
                          <span className="font-medium w-20 shrink-0">{formatCents(amount)}</span>
                          <Input
                            type="date"
                            value={date}
                            onChange={(e) => handleInstallmentDateChange(i, e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Observações */}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending || !form.student_id || !form.plan_id || !form.payment_method}
            >
              {isPending ? "Salvando..." : contract ? "Salvar" : "Criar Contrato"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
