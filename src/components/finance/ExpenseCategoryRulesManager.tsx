import { useState } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useExpenseCategories, type ExpenseCategory } from "@/hooks/useExpenses";

interface CategoryRule {
  id: string;
  keyword: string;
  category_id: string;
  priority: number;
  is_active: boolean;
}

function useCategoryRules() {
  return useQuery({
    queryKey: ["expense_category_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_category_rules")
        .select("*")
        .order("priority", { ascending: false });
      if (error) throw error;
      return data as CategoryRule[];
    },
  });
}

function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { keyword: string; category_id: string; priority?: number }) => {
      const { error } = await supabase.from("expense_category_rules").insert({
        keyword: data.keyword.toUpperCase(),
        category_id: data.category_id,
        priority: data.priority ?? 5,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense_category_rules"] });
      toast.success("Regra criada!");
    },
    onError: (e: Error) => toast.error(e.message.includes("unique") ? "Palavra-chave já existe." : "Erro ao criar regra."),
  });
}

function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expense_category_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense_category_rules"] });
      toast.success("Regra removida!");
    },
    onError: () => toast.error("Erro ao remover regra."),
  });
}

export function ExpenseCategoryRulesManager() {
  const { data: rules, isLoading } = useCategoryRules();
  const { data: categories } = useExpenseCategories();
  const createRule = useCreateRule();
  const deleteRule = useDeleteRule();

  const [adding, setAdding] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");

  const catMap = new Map<string, ExpenseCategory>();
  categories?.forEach((c) => catMap.set(c.id, c));

  const handleCreate = () => {
    if (!newKeyword.trim() || !newCategoryId) return;
    createRule.mutate(
      { keyword: newKeyword.trim(), category_id: newCategoryId },
      { onSuccess: () => { setAdding(false); setNewKeyword(""); setNewCategoryId(""); } }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Regras de Categorização Automática</h3>
          <p className="text-xs text-muted-foreground">
            Ao importar um extrato, despesas DÉBITO são criadas automaticamente. As regras abaixo definem a categoria com base em palavras-chave no memo da transação.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova Regra
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Palavra-chave</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="w-[80px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adding && (
              <TableRow>
                <TableCell>
                  <Input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="Ex: NETFLIX, ENEL..."
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") setAdding(false);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCreate} disabled={createRule.isPending || !newKeyword.trim() || !newCategoryId}>
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAdding(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {isLoading ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Carregando...</TableCell></TableRow>
            ) : !rules?.length && !adding ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Nenhuma regra cadastrada</TableCell></TableRow>
            ) : (
              rules?.map((rule) => {
                const cat = catMap.get(rule.category_id);
                return (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{rule.keyword}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{cat?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteRule.mutate(rule.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
