import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useCreateLead, type LeadFormData } from "@/hooks/useLeads";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateLeadScore, gradeColors, type QualificationDetails } from "@/lib/leadScoring";

const SOURCES = [
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "indicacao", label: "Indicação" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "site", label: "Site" },
  { value: "outro", label: "Outro" },
];

const OBJECTIVES = [
  { value: "performance", label: "Performance" },
  { value: "saude", label: "Saúde" },
  { value: "longevidade", label: "Longevidade" },
  { value: "qualidade_vida", label: "Qualidade de Vida" },
  { value: "estetica", label: "Estética" },
  { value: "reabilitacao", label: "Reabilitação" },
  { value: "outro", label: "Outro" },
];

const AGE_RANGES = ["18-29", "30-39", "40-55", "56-65", "65+"];

const TEMPERATURES = [
  { value: "hot", label: "🔥 Quente", color: "text-red-600" },
  { value: "warm", label: "🌤 Morno", color: "text-yellow-600" },
  { value: "cold", label: "❄️ Frio", color: "text-blue-600" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadFormDialog({ open, onOpenChange }: Props) {
  const createLead = useCreateLead();

  const { data: profiles } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<LeadFormData & { temperature?: string; consultant_id?: string }>({
    name: "",
    email: "",
    phone: "",
    source: "",
    notes: "",
    tags: [],
    qualification_details: {},
    temperature: "",
    consultant_id: "",
  });

  const details = form.qualification_details ?? {};
  const { score, grade } = calculateLeadScore(details);

  const updateDetail = (key: keyof QualificationDetails, value: any) => {
    setForm({
      ...form,
      qualification_details: { ...details, [key]: value },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { temperature, consultant_id, ...rest } = form;
    createLead.mutate(rest, {
      onSuccess: () => {
        onOpenChange(false);
        setForm({ name: "", email: "", phone: "", source: "", notes: "", tags: [], qualification_details: {}, temperature: "", consultant_id: "" });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Novo Lead
            {form.name && (
              <Badge variant="outline" className={gradeColors[grade]}>
                {grade} ({score}pts)
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Temperatura</Label>
              <Select value={form.temperature ?? ""} onValueChange={(v) => setForm({ ...form, temperature: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {TEMPERATURES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Consultor</Label>
              <Select value={form.consultant_id ?? ""} onValueChange={(v) => setForm({ ...form, consultant_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {profiles?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Qualification */}
          <div className="border-t border-border pt-3 space-y-3">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Qualificação</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Objetivo</Label>
                <Select value={details.objective ?? ""} onValueChange={(v) => updateDetail("objective", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {OBJECTIVES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Faixa etária</Label>
                <Select value={details.age_range ?? ""} onValueChange={(v) => updateDetail("age_range", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {AGE_RANGES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Profissão</Label>
                <Input value={details.profession ?? ""} onChange={(e) => updateDetail("profession", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Horário preferido</Label>
                <Input value={details.preferred_time ?? ""} onChange={(e) => updateDetail("preferred_time", e.target.value)} placeholder="Ex: manhã, 7h-9h" />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch
                  checked={details.has_trained_before ?? false}
                  onCheckedChange={(v) => updateDetail("has_trained_before", v)}
                />
                <Label>Já treinou antes?</Label>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createLead.isPending || !form.name.trim()}>
              {createLead.isPending ? "Salvando..." : "Cadastrar Lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
