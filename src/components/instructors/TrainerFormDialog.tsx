import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X } from "lucide-react";
import { useCreateTrainer, useUpdateTrainer } from "@/hooks/useTrainers";
import type { Trainer } from "@/hooks/schedule/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trainer?: Trainer | null;
}

const emptyForm = {
  full_name: "",
  email: "",
  phone: "",
  cpf: "",
  bio: "",
  notes: "",
  is_active: true,
  payment_method: "hourly" as "hourly" | "per_session" | "hybrid",
  hourly_rate_main_cents: 0,
  hourly_rate_assistant_cents: 0,
  session_rate_cents: 0,
  specialties: [] as string[],
  certifications: [] as string[],
  hired_at: "",
  pix_key: "",
  pix_key_type: "",
  bank_name: "",
  bank_agency: "",
  bank_account: "",
};

export function TrainerFormDialog({ open, onOpenChange, trainer }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [newSpecialty, setNewSpecialty] = useState("");
  const [newCert, setNewCert] = useState("");

  const create = useCreateTrainer();
  const update = useUpdateTrainer();
  const isEdit = !!trainer;

  useEffect(() => {
    if (trainer) {
      setForm({
        full_name: trainer.full_name || "",
        email: trainer.email || "",
        phone: trainer.phone || "",
        cpf: trainer.cpf || "",
        bio: trainer.bio || "",
        notes: trainer.notes || "",
        is_active: trainer.is_active ?? true,
        payment_method: trainer.payment_method || "hourly",
        hourly_rate_main_cents: trainer.hourly_rate_main_cents || 0,
        hourly_rate_assistant_cents: trainer.hourly_rate_assistant_cents || 0,
        session_rate_cents: trainer.session_rate_cents || 0,
        specialties: trainer.specialties || [],
        certifications: trainer.certifications || [],
        hired_at: trainer.hired_at || "",
        pix_key: trainer.pix_key || "",
        pix_key_type: trainer.pix_key_type || "",
        bank_name: trainer.bank_name || "",
        bank_agency: trainer.bank_agency || "",
        bank_account: trainer.bank_account || "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [trainer, open]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const centsToReal = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const realToCents = (s: string) => Math.round(parseFloat(s.replace(",", ".") || "0") * 100);

  const addTag = (field: "specialties" | "certifications", value: string, setter: (v: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed || form[field].includes(trimmed)) return;
    set(field, [...form[field], trimmed]);
    setter("");
  };

  const removeTag = (field: "specialties" | "certifications", value: string) => {
    set(field, form[field].filter((t) => t !== value));
  };

  const handleSubmit = () => {
    if (!form.full_name.trim()) return;
    const payload: any = { ...form };
    if (!payload.hired_at) delete payload.hired_at;

    if (isEdit) {
      update.mutate({ id: trainer!.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Treinador" : "Novo Treinador"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="info" className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">Dados</TabsTrigger>
            <TabsTrigger value="rates">Taxas</TabsTrigger>
            <TabsTrigger value="bank">Bancário</TabsTrigger>
          </TabsList>

          {/* Tab: Dados pessoais */}
          <TabsContent value="info" className="space-y-3 mt-3">
            <div>
              <Label>Nome completo *</Label>
              <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={(e) => set("cpf", e.target.value)} />
              </div>
              <div>
                <Label>Data de contratação</Label>
                <Input type="date" value={form.hired_at} onChange={(e) => set("hired_at", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Bio</Label>
              <Textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} rows={2} />
            </div>

            {/* Specialties */}
            <div>
              <Label>Especialidades</Label>
              <div className="flex gap-1.5 flex-wrap mb-1.5">
                {form.specialties.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs gap-1">
                    {s}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag("specialties", s)} />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input
                  placeholder="Adicionar especialidade"
                  value={newSpecialty}
                  onChange={(e) => setNewSpecialty(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag("specialties", newSpecialty, setNewSpecialty))}
                  className="h-8 text-sm"
                />
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => addTag("specialties", newSpecialty, setNewSpecialty)}>+</Button>
              </div>
            </div>

            {/* Certifications */}
            <div>
              <Label>Certificações</Label>
              <div className="flex gap-1.5 flex-wrap mb-1.5">
                {form.certifications.map((c) => (
                  <Badge key={c} variant="outline" className="text-xs gap-1">
                    {c}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag("certifications", c)} />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input
                  placeholder="Adicionar certificação"
                  value={newCert}
                  onChange={(e) => setNewCert(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag("certifications", newCert, setNewCert))}
                  className="h-8 text-sm"
                />
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => addTag("certifications", newCert, setNewCert)}>+</Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Ativo</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
            </div>
          </TabsContent>

          {/* Tab: Taxas */}
          <TabsContent value="rates" className="space-y-3 mt-3">
            <div>
              <Label>Método de pagamento</Label>
              <Select value={form.payment_method} onValueChange={(v) => set("payment_method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Por hora</SelectItem>
                  <SelectItem value="per_session">Por sessão</SelectItem>
                  <SelectItem value="hybrid">Híbrido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(form.payment_method === "hourly" || form.payment_method === "hybrid") && (
              <>
                <div>
                  <Label>Taxa/hora — Principal (R$)</Label>
                  <Input
                    value={centsToReal(form.hourly_rate_main_cents)}
                    onChange={(e) => set("hourly_rate_main_cents", realToCents(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Taxa/hora — Assistente (R$)</Label>
                  <Input
                    value={centsToReal(form.hourly_rate_assistant_cents)}
                    onChange={(e) => set("hourly_rate_assistant_cents", realToCents(e.target.value))}
                  />
                </div>
              </>
            )}

            {(form.payment_method === "per_session" || form.payment_method === "hybrid") && (
              <div>
                <Label>Taxa por sessão (R$)</Label>
                <Input
                  value={centsToReal(form.session_rate_cents)}
                  onChange={(e) => set("session_rate_cents", realToCents(e.target.value))}
                />
              </div>
            )}
          </TabsContent>

          {/* Tab: Bancário */}
          <TabsContent value="bank" className="space-y-3 mt-3">
            <div>
              <Label>Tipo de chave PIX</Label>
              <Select value={form.pix_key_type || "none"} onValueChange={(v) => set("pix_key_type", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Telefone</SelectItem>
                  <SelectItem value="random">Aleatória</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.pix_key_type && (
              <div>
                <Label>Chave PIX</Label>
                <Input value={form.pix_key} onChange={(e) => set("pix_key", e.target.value)} />
              </div>
            )}
            <div>
              <Label>Banco</Label>
              <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Agência</Label>
                <Input value={form.bank_agency} onChange={(e) => set("bank_agency", e.target.value)} />
              </div>
              <div>
                <Label>Conta</Label>
                <Input value={form.bank_account} onChange={(e) => set("bank_account", e.target.value)} />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!form.full_name.trim() || isPending}>
            {isPending ? "Salvando..." : isEdit ? "Salvar" : "Cadastrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
