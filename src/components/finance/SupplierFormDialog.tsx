import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useCreateSupplier, useUpdateSupplier, type Supplier, type SupplierFormData } from "@/hooks/useSuppliers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
}

export function SupplierFormDialog({ open, onOpenChange, supplier }: Props) {
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();

  const [form, setForm] = useState<SupplierFormData>({
    name: "",
    legal_name: "",
    cnpj: "",
    email: "",
    phone: "",
    pix_key: "",
    bank_name: "",
    bank_branch: "",
    bank_account: "",
    payment_terms: "",
    contact_name: "",
    notes: "",
    is_active: true,
  });

  useEffect(() => {
    if (supplier) {
      setForm({
        name: supplier.name,
        legal_name: supplier.legal_name || "",
        cnpj: supplier.cnpj || "",
        email: supplier.email || "",
        phone: supplier.phone || "",
        pix_key: supplier.pix_key || "",
        bank_name: supplier.bank_name || "",
        bank_branch: supplier.bank_branch || "",
        bank_account: supplier.bank_account || "",
        payment_terms: supplier.payment_terms || "",
        contact_name: supplier.contact_name || "",
        notes: supplier.notes || "",
        is_active: supplier.is_active,
      });
    } else {
      setForm({
        name: "", legal_name: "", cnpj: "", email: "", phone: "",
        pix_key: "", bank_name: "", bank_branch: "", bank_account: "",
        payment_terms: "", contact_name: "", notes: "", is_active: true,
      });
    }
  }, [supplier, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (supplier) {
      updateSupplier.mutate({ id: supplier.id, data: form }, { onSuccess: () => onOpenChange(false) });
    } else {
      createSupplier.mutate(form, { onSuccess: () => onOpenChange(false) });
    }
  };

  const isPending = createSupplier.isPending || updateSupplier.isPending;
  const set = (key: keyof SupplierFormData, value: string | boolean) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome Fantasia *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Razão Social</Label>
              <Input value={form.legal_name || ""} onChange={(e) => set("legal_name", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>CNPJ</Label>
              <Input value={form.cnpj || ""} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <div className="space-y-1.5">
              <Label>Contato</Label>
              <Input value={form.contact_name || ""} onChange={(e) => set("contact_name", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Chave PIX</Label>
            <Input value={form.pix_key || ""} onChange={(e) => set("pix_key", e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <Input value={form.bank_name || ""} onChange={(e) => set("bank_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Agência</Label>
              <Input value={form.bank_branch || ""} onChange={(e) => set("bank_branch", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Input value={form.bank_account || ""} onChange={(e) => set("bank_account", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Condições de Pagamento</Label>
            <Input value={form.payment_terms || ""} onChange={(e) => set("payment_terms", e.target.value)} placeholder="Ex: 30 dias" />
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>

          {supplier && (
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              <Label>Ativo</Label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending || !form.name}>
              {isPending ? "Salvando..." : supplier ? "Salvar" : "Criar Fornecedor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
