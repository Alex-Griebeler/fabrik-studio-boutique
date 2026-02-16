import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useCreateBankAccount, useUpdateBankAccount, type BankAccount, type BankAccountFormData } from "@/hooks/useBankAccounts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: BankAccount | null;
}

export function BankAccountFormDialog({ open, onOpenChange, account }: Props) {
  const createAccount = useCreateBankAccount();
  const updateAccount = useUpdateBankAccount();

  const [form, setForm] = useState<BankAccountFormData>({
    name: "",
    bank_code: "",
    bank_name: "",
    branch: "",
    account_number: "",
    pix_key: "",
    current_balance_cents: 0,
    notes: "",
    is_active: true,
  });

  useEffect(() => {
    if (account) {
      setForm({
        name: account.name,
        bank_code: account.bank_code || "",
        bank_name: account.bank_name || "",
        branch: account.branch || "",
        account_number: account.account_number || "",
        pix_key: account.pix_key || "",
        current_balance_cents: account.current_balance_cents,
        notes: account.notes || "",
        is_active: account.is_active,
      });
    } else {
      setForm({ name: "", bank_code: "", bank_name: "", branch: "", account_number: "", pix_key: "", current_balance_cents: 0, notes: "", is_active: true });
    }
  }, [account, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (account) {
      updateAccount.mutate({ id: account.id, data: form }, { onSuccess: () => onOpenChange(false) });
    } else {
      createAccount.mutate(form, { onSuccess: () => onOpenChange(false) });
    }
  };

  const isPending = createAccount.isPending || updateAccount.isPending;
  const set = (key: keyof BankAccountFormData, value: string | number | boolean) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{account ? "Editar Conta" : "Nova Conta Bancária"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome da Conta *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex: Itaú Conta Corrente" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <Input value={form.bank_name || ""} onChange={(e) => set("bank_name", e.target.value)} placeholder="Ex: Itaú" />
            </div>
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input value={form.bank_code || ""} onChange={(e) => set("bank_code", e.target.value)} placeholder="341" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Agência</Label>
              <Input value={form.branch || ""} onChange={(e) => set("branch", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Input value={form.account_number || ""} onChange={(e) => set("account_number", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Chave PIX</Label>
            <Input value={form.pix_key || ""} onChange={(e) => set("pix_key", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Saldo Atual (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={((form.current_balance_cents ?? 0) / 100).toFixed(2)}
              onChange={(e) => set("current_balance_cents", Math.round(parseFloat(e.target.value || "0") * 100))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>

          {account && (
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              <Label>Ativa</Label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending || !form.name}>
              {isPending ? "Salvando..." : account ? "Salvar" : "Criar Conta"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
