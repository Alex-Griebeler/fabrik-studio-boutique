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
import { useCreateTrainer, useTrainerAdmin, useUpdateTrainer } from "@/hooks/useTrainers";
import { useServiceTypes, useTrainerServiceRates } from "@/hooks/useServiceRates";
import { centsToReal } from "@/lib/money";
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

  // Onda 1.5a: a lista (useTrainers) não carrega mais cpf/banco/pix/notes
  // — o registro completo vem da view trainers_admin. Inicializar o form
  // a partir da lista SOBRESCREVERIA os dados sensíveis com vazio no
  // save; por isso o form só é populado (e o salvar só é liberado)
  // quando o registro completo chega.
  const fullTrainer = useTrainerAdmin(trainer?.id);

  // Hidratação UMA VEZ por abertura/treinador: refetch em background não
  // repopula (repopular apagaria edição em curso — rodada 2 do Codex).
  const [hydratedForId, setHydratedForId] = useState<string | null>(null);
  const fullLoaded = !!trainer && hydratedForId === trainer.id;

  useEffect(() => {
    if (!open) {
      setHydratedForId(null);
      return;
    }
    if (!trainer) {
      setForm(emptyForm);
      setHydratedForId(null);
      return;
    }
    if (hydratedForId === trainer.id) return; // já hidratado; não repopular
    // Hidratação inicial exige dado FRESCO: isSuccess + sem refetch em
    // voo — cache stale pós-invalidate hidrataria valores antigos e o
    // próximo save os restauraria (rodada 3 do Codex).
    if (
      fullTrainer.isSuccess &&
      !fullTrainer.isFetching &&
      fullTrainer.data &&
      fullTrainer.data.id === trainer.id
    ) {
      const t = fullTrainer.data;
      setForm({
        full_name: t.full_name || "",
        email: t.email || "",
        phone: t.phone || "",
        cpf: t.cpf || "",
        bio: t.bio || "",
        notes: t.notes || "",
        is_active: t.is_active ?? true,
        specialties: t.specialties || [],
        certifications: t.certifications || [],
        hired_at: t.hired_at || "",
        pix_key: t.pix_key || "",
        pix_key_type: t.pix_key_type || "",
        bank_name: t.bank_name || "",
        bank_agency: t.bank_agency || "",
        bank_account: t.bank_account || "",
      });
      setHydratedForId(trainer.id);
    }
  }, [open, trainer, hydratedForId, fullTrainer.isSuccess, fullTrainer.isFetching, fullTrainer.data]);

  const set = <K extends keyof typeof emptyForm>(k: K, v: (typeof emptyForm)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // PR-E: as tarifas vivem em trainer_service_rates (aba "Pagamentos à
  // equipe"); aqui só o RESUMO somente-leitura do profissional.
  const { data: services } = useServiceTypes();
  const { data: serviceRates } = useTrainerServiceRates();
  const trainerRates = trainer
    ? (serviceRates ?? [])
        .filter((r) => r.trainer_id === trainer.id)
        .map((r) => ({
          name: services?.find((sv) => sv.id === r.service_type_id)?.name ?? "Serviço",
          label: `R$ ${centsToReal(r.rate_cents)}${r.rate_basis === "hourly" ? "/h" : "/sessão"}`,
        }))
    : [];

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
    // Guard anti-perda de dados: em edição, nunca salvar sem o registro
    // completo DESTE treinador carregado e estável (fetch concluído).
    if (isEdit && !fullLoaded) return;

    const { hired_at, ...rest } = form;
    const payload: Partial<Trainer> = hired_at ? { ...rest, hired_at } : rest;

    if (isEdit) {
      update.mutate({ id: trainer!.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  const isPending = create.isPending || update.isPending || (isEdit && !fullLoaded);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Treinador" : "Novo Treinador"}</DialogTitle>
        </DialogHeader>

        {isEdit && fullTrainer.isError && (
          <p className="text-sm text-destructive">
            Não foi possível carregar os dados completos do treinador — edição
            bloqueada para evitar sobrescrever dados bancários. Recarregue e
            tente de novo.
          </p>
        )}

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

          {/* Tab: Taxas — resumo somente-leitura (PR-E): tarifa vive em
              trainer_service_rates; edição é na aba "Pagamentos à equipe"
              da página Treinadores. Dois editores = a redundância que o
              dono vetou. */}
          <TabsContent value="rates" className="space-y-3 mt-3">
            {!isEdit ? (
              <p className="text-sm text-muted-foreground">
                Cadastre o treinador primeiro — depois defina as tarifas por
                serviço na aba <strong>Pagamentos à equipe</strong>.
              </p>
            ) : trainerRates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem tarifas cadastradas. Defina na aba{" "}
                <strong>Pagamentos à equipe</strong> da página Treinadores.
              </p>
            ) : (
              <div className="space-y-2">
                {trainerRates.map((r) => (
                  <div key={r.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{r.name}</span>
                    <span className="font-medium">{r.label}</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Valores que o estúdio paga ao profissional. Edição na aba{" "}
                  <strong>Pagamentos à equipe</strong>.
                </p>
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
