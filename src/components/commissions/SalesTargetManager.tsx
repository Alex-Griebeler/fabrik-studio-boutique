import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSalesTargets, useUpsertSalesTarget } from "@/hooks/useSalesTargets";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function SalesTargetManager() {
  const currentMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const { data: targets, isLoading } = useSalesTargets();
  const upsert = useUpsertSalesTarget();

  const { data: profiles } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    profile_id: "",
    competencia: currentMonth,
    meta_leads: 0,
    meta_experimentais: 0,
    meta_conversoes: 0,
    meta_faturamento_cents: 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsert.mutate(form, { onSuccess: () => setForm(f => ({ ...f, profile_id: "" })) });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Definir Meta</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Consultor</Label>
                <Select value={form.profile_id} onValueChange={v => setForm(f => ({ ...f, profile_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{profiles?.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Competência</Label>
                <Input type="month" value={form.competencia.slice(0, 7)} onChange={e => setForm(f => ({ ...f, competencia: e.target.value + "-01" }))} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Meta Leads</Label>
                <Input type="number" value={form.meta_leads} onChange={e => setForm(f => ({ ...f, meta_leads: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Meta Experimentais</Label>
                <Input type="number" value={form.meta_experimentais} onChange={e => setForm(f => ({ ...f, meta_experimentais: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Meta Conversões</Label>
                <Input type="number" value={form.meta_conversoes} onChange={e => setForm(f => ({ ...f, meta_conversoes: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Meta Faturamento (R$)</Label>
                <Input type="number" step="0.01" value={(form.meta_faturamento_cents / 100).toFixed(2)} onChange={e => setForm(f => ({ ...f, meta_faturamento_cents: Math.round(parseFloat(e.target.value || "0") * 100) }))} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={upsert.isPending || !form.profile_id} size="sm">
                {upsert.isPending ? "Salvando..." : "Salvar Meta"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Metas Cadastradas</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !targets?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma meta cadastrada</p>
          ) : (
            <div className="space-y-2">
              {targets.map(t => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{(t.profiles as { full_name?: string } | null)?.full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(t.competencia), "MMMM/yyyy", { locale: ptBR })}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span>Leads: {t.realizado_leads}/{t.meta_leads}</span>
                    <span>Conv: {t.realizado_conversoes}/{t.meta_conversoes}</span>
                    <span>Fat: {formatCurrency(t.realizado_faturamento_cents)}/{formatCurrency(t.meta_faturamento_cents)}</span>
                    <Badge variant={t.meta_batida ? "default" : "outline"} className="text-[10px]">
                      {t.meta_batida ? "✓ Batida" : "Em andamento"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
