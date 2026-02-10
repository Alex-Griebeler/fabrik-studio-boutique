import { useState } from "react";
import { Plus, Search, Pencil, Package } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PlanFormDialog } from "@/components/plans/PlanFormDialog";
import {
  usePlans, useCreatePlan, useUpdatePlan,
  categoryLabels, durationLabels, formatCents,
  type Plan, type PlanFormData, type CategoryFilter,
} from "@/hooks/usePlans";

export default function Plans() {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [activeOnly, setActiveOnly] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  const { data: plans, isLoading } = usePlans(categoryFilter, activeOnly);
  const createMutation = useCreatePlan();
  const updateMutation = useUpdatePlan();

  const handleCreate = () => { setEditingPlan(null); setDialogOpen(true); };
  const handleEdit = (plan: Plan) => { setEditingPlan(plan); setDialogOpen(true); };

  const handleSubmit = (data: PlanFormData) => {
    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, data }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createMutation.mutate(data, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // Group plans by category
  const grouped = plans?.reduce<Record<string, Plan[]>>((acc, plan) => {
    const cat = plan.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(plan);
    return acc;
  }, {}) ?? {};

  return (
    <div className="space-y-4">
      <PageHeader
        title="Planos"
        description="Gerencie todos os planos e valores"
        actions={
          <Button className="font-semibold" onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" /> Novo Plano
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
          <SelectTrigger className="w-full sm:w-[240px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {Object.entries(categoryLabels).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch checked={activeOnly} onCheckedChange={setActiveOnly} id="active-only" />
          <label htmlFor="active-only" className="text-sm text-muted-foreground cursor-pointer">Apenas ativos</label>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !plans?.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Package className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-sm font-medium">Nenhum plano encontrado</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Ajuste os filtros ou cadastre um novo plano</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, catPlans]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                {categoryLabels[category as keyof typeof categoryLabels] ?? category}
                <Badge variant="secondary" className="ml-2 text-xs">{catPlans.length}</Badge>
              </h3>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Nome</TableHead>
                      <TableHead>Duração</TableHead>
                      <TableHead className="hidden sm:table-cell">Frequência</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead className="hidden md:table-cell">Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catPlans.map((plan) => (
                      <TableRow key={plan.id} className="group">
                        <TableCell className="font-medium">{plan.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {durationLabels[plan.duration]}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                          {plan.frequency || "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCents(plan.price_cents)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant={plan.is_active ? "default" : "secondary"}>
                            {plan.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleEdit(plan)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}

      {plans && plans.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {plans.length} plano{plans.length !== 1 ? "s" : ""} encontrado{plans.length !== 1 ? "s" : ""}
        </p>
      )}

      <PlanFormDialog open={dialogOpen} onOpenChange={setDialogOpen} plan={editingPlan} onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </div>
  );
}
