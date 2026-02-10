import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateContract, useUpdateContract, paymentMethodLabels, type Contract, type ContractFormData } from "@/hooks/useContracts";
import { useStudents } from "@/hooks/useStudents";
import { usePlans, formatCents, categoryLabels } from "@/hooks/usePlans";
import type { Database } from "@/integrations/supabase/types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];
const paymentMethods: PaymentMethod[] = ["pix", "credit_card", "debit_card", "boleto", "cash", "transfer"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract?: Contract | null;
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
    monthly_value_cents: 0,
    discount_cents: 0,
    payment_method: undefined,
    payment_day: 10,
    notes: "",
  });

  useEffect(() => {
    if (contract) {
      setForm({
        student_id: contract.student_id,
        plan_id: contract.plan_id,
        start_date: contract.start_date,
        end_date: contract.end_date || "",
        status: contract.status,
        monthly_value_cents: contract.monthly_value_cents || 0,
        discount_cents: contract.discount_cents || 0,
        payment_method: contract.payment_method || undefined,
        payment_day: contract.payment_day || 10,
        notes: contract.notes || "",
      });
    } else {
      setForm({
        student_id: "",
        plan_id: "",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: "",
        monthly_value_cents: 0,
        discount_cents: 0,
        payment_method: undefined,
        payment_day: 10,
        notes: "",
      });
    }
  }, [contract, open]);

  // Auto-fill monthly value when plan changes
  useEffect(() => {
    if (form.plan_id && plans) {
      const plan = plans.find((p) => p.id === form.plan_id);
      if (plan && !contract) {
        setForm((prev) => ({ ...prev, monthly_value_cents: plan.price_cents }));
      }
    }
  }, [form.plan_id, plans, contract]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (contract) {
      updateContract.mutate({ id: contract.id, data: form }, { onSuccess: () => onOpenChange(false) });
    } else {
      createContract.mutate(form, { onSuccess: () => onOpenChange(false) });
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
          <div className="grid grid-cols-1 gap-4">
            {/* Student */}
            <div className="space-y-1.5">
              <Label>Aluno *</Label>
              <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
                <SelectContent>
                  {students?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Plan */}
            <div className="space-y-1.5">
              <Label>Plano *</Label>
              <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o plano" /></SelectTrigger>
                <SelectContent>
                  {plans?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatCents(p.price_cents)} ({categoryLabels[p.category]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data Início *</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>Data Fim</Label>
                <Input type="date" value={form.end_date || ""} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>

            {/* Values */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor Mensal (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={((form.monthly_value_cents || 0) / 100).toFixed(2)}
                  onChange={(e) => setForm({ ...form, monthly_value_cents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Desconto (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={((form.discount_cents || 0) / 100).toFixed(2)}
                  onChange={(e) => setForm({ ...form, discount_cents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                />
              </div>
            </div>

            {/* Payment */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Forma de Pagamento</Label>
                <Select value={form.payment_method || ""} onValueChange={(v) => setForm({ ...form, payment_method: v as PaymentMethod })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((m) => (
                      <SelectItem key={m} value={m}>{paymentMethodLabels[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Dia de Pagamento</Label>
                <Input type="number" min={1} max={31} value={form.payment_day || ""} onChange={(e) => setForm({ ...form, payment_day: parseInt(e.target.value) || undefined })} />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending || !form.student_id || !form.plan_id}>
              {isPending ? "Salvando..." : contract ? "Salvar" : "Criar Contrato"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
