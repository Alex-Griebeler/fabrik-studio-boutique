import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  categoryLabels, durationLabels,
  type Plan, type PlanFormData,
} from "@/hooks/usePlans";
import { Constants } from "@/integrations/supabase/types";

const planSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(120),
  category: z.enum(Constants.public.Enums.plan_category as unknown as [string, ...string[]]),
  duration: z.enum(Constants.public.Enums.plan_duration as unknown as [string, ...string[]]),
  frequency: z.string().trim().max(30).optional().default(""),
  price_reais: z.string().min(1, "Preço obrigatório"),
  description: z.string().trim().max(500).optional().default(""),
  is_active: z.boolean(),
  validity_days: z.string().optional().default(""),
});

type FormValues = z.infer<typeof planSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: Plan | null;
  onSubmit: (data: PlanFormData) => void;
  isSubmitting: boolean;
}

function centsToReais(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function reaisToCents(reais: string): number {
  const cleaned = reais.replace(/[^\d,]/g, "").replace(",", ".");
  return Math.round(parseFloat(cleaned) * 100) || 0;
}

export function PlanFormDialog({ open, onOpenChange, plan, onSubmit, isSubmitting }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: "", category: "grupos_adultos", duration: "mensal",
      frequency: "", price_reais: "", description: "", is_active: true, validity_days: "",
    },
  });

  useEffect(() => {
    if (plan) {
      form.reset({
        name: plan.name,
        category: plan.category,
        duration: plan.duration,
        frequency: plan.frequency ?? "",
        price_reais: centsToReais(plan.price_cents),
        description: plan.description ?? "",
        is_active: plan.is_active,
        validity_days: plan.validity_days?.toString() ?? "",
      });
    } else {
      form.reset({
        name: "", category: "grupos_adultos", duration: "mensal",
        frequency: "", price_reais: "", description: "", is_active: true, validity_days: "",
      });
    }
  }, [plan, open, form]);

  const handleSubmit = (values: FormValues) => {
    onSubmit({
      name: values.name,
      category: values.category as PlanFormData["category"],
      duration: values.duration as PlanFormData["duration"],
      frequency: values.frequency || undefined,
      price_cents: reaisToCents(values.price_reais),
      description: values.description || undefined,
      is_active: values.is_active,
      validity_days: values.validity_days ? parseInt(values.validity_days) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {plan ? "Editar Plano" : "Novo Plano"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome *</FormLabel>
                <FormControl><Input placeholder="Nome do plano" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {Object.entries(categoryLabels).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="duration" render={({ field }) => (
                <FormItem>
                  <FormLabel>Duração *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {Object.entries(durationLabels).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="frequency" render={({ field }) => (
                <FormItem>
                  <FormLabel>Frequência</FormLabel>
                  <FormControl><Input placeholder="2x/semana" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="price_reais" render={({ field }) => (
                <FormItem>
                  <FormLabel>Preço (R$) *</FormLabel>
                  <FormControl><Input placeholder="120,00" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="validity_days" render={({ field }) => (
                <FormItem>
                  <FormLabel>Validade (dias)</FormLabel>
                  <FormControl><Input type="number" placeholder="30" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl><Textarea placeholder="Detalhes do plano" rows={2} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="is_active" render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                <FormLabel className="text-sm">Plano ativo</FormLabel>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )} />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : plan ? "Salvar" : "Cadastrar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
