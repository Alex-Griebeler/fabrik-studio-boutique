import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateCommission } from "@/hooks/useCommissions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIPOS = [
  { value: "venda_nova", label: "Venda Nova" },
  { value: "renovacao", label: "Renovação" },
  { value: "indicacao", label: "Indicação" },
  { value: "meta", label: "Bônus Meta" },
];

export function CommissionFormDialog({ open, onOpenChange }: Props) {
  const create = useCreateCommission();
  const { data: profiles } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, commission_rate_pct").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    profile_id: "",
    competencia: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    tipo: "venda_nova" as const,
    valor_base_cents: 0,
    percentual_comissao: 10,
    valor_comissao_cents: 0,
  });

  const calcCommission = (base: number, pct: number) => Math.round(base * pct / 100);

  const handleProfileChange = (id: string) => {
    const p = profiles?.find(pr => pr.id === id);
    const pct = (p as any)?.commission_rate_pct ?? 10;
    setForm(f => ({
      ...f,
      profile_id: id,
      percentual_comissao: pct,
      valor_comissao_cents: calcCommission(f.valor_base_cents, pct),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(form, {
      onSuccess: () => {
        onOpenChange(false);
        setForm({ profile_id: "", competencia: format(startOfMonth(new Date()), "yyyy-MM-dd"), tipo: "venda_nova", valor_base_cents: 0, percentual_comissao: 10, valor_comissao_cents: 0 });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova Comissão</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Consultor *</Label>
            <Select value={form.profile_id} onValueChange={handleProfileChange}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {profiles?.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Competência</Label>
              <Input type="month" value={form.competencia.slice(0, 7)} onChange={e => setForm(f => ({ ...f, competencia: e.target.value + "-01" }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Base (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={(form.valor_base_cents / 100).toFixed(2)}
                onChange={e => {
                  const base = Math.round(parseFloat(e.target.value || "0") * 100);
                  setForm(f => ({ ...f, valor_base_cents: base, valor_comissao_cents: calcCommission(base, f.percentual_comissao) }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>% Comissão</Label>
              <Input
                type="number"
                step="0.1"
                value={form.percentual_comissao}
                onChange={e => {
                  const pct = parseFloat(e.target.value || "0");
                  setForm(f => ({ ...f, percentual_comissao: pct, valor_comissao_cents: calcCommission(f.valor_base_cents, pct) }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Comissão (R$)</Label>
              <Input type="text" readOnly value={(form.valor_comissao_cents / 100).toFixed(2)} className="bg-muted" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending || !form.profile_id}>
              {create.isPending ? "Salvando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
