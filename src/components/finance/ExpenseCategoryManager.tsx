import { useState, useMemo } from "react";
import { Plus, Pencil, Check, X, ChevronRight, ChevronDown, FolderPlus, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useAllExpenseCategories,
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
  type ExpenseCategory,
} from "@/hooks/useExpenses";

function toSlug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const COLORS = ["gray", "blue", "green", "red", "yellow", "purple", "orange", "pink", "teal"];

const colorClasses: Record<string, string> = {
  gray: "bg-muted text-muted-foreground",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
};

export function ExpenseCategoryManager() {
  const { data: categories, isLoading } = useAllExpenseCategories();
  const createCategory = useCreateExpenseCategory();
  const updateCategory = useUpdateExpenseCategory();

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("gray");
  const [addingTo, setAddingTo] = useState<string | null | "root">(null); // null=none, "root"=new group, string=sub under parent
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("gray");

  // Build tree: groups (parent_id=null) → children
  const { groups, childrenMap } = useMemo(() => {
    if (!categories) return { groups: [], childrenMap: new Map<string, ExpenseCategory[]>() };
    const grps = categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order);
    const map = new Map<string, ExpenseCategory[]>();
    categories
      .filter((c) => c.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((c) => {
        const arr = map.get(c.parent_id!) || [];
        arr.push(c);
        map.set(c.parent_id!, arr);
      });
    return { groups: grps, childrenMap: map };
  }, [categories]);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startEdit = (cat: ExpenseCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateCategory.mutate(
      { id: editingId, data: { name: editName.trim(), slug: toSlug(editName), color: editColor } },
      { onSuccess: () => setEditingId(null) }
    );
  };

  const toggleActive = (cat: ExpenseCategory) => {
    updateCategory.mutate({ id: cat.id, data: { is_active: !cat.is_active } });
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    const parentId = addingTo === "root" ? null : addingTo;
    const siblings = parentId ? (childrenMap.get(parentId) || []) : groups;
    createCategory.mutate(
      { name: newName.trim(), slug: toSlug(newName), color: newColor, parent_id: parentId, sort_order: siblings.length },
      {
        onSuccess: () => {
          setAddingTo(null);
          setNewName("");
          setNewColor("gray");
          if (parentId) setExpandedGroups((prev) => new Set(prev).add(parentId));
        },
      }
    );
  };

  if (isLoading) return <div className="text-sm text-muted-foreground py-4">Carregando categorias...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Categorias de Despesas</h3>
        <Button size="sm" variant="outline" onClick={() => { setAddingTo("root"); setNewName(""); setNewColor("gray"); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Novo Grupo
        </Button>
      </div>

      {/* Add new group inline */}
      {addingTo === "root" && (
        <InlineForm
          name={newName}
          setName={setNewName}
          color={newColor}
          setColor={setNewColor}
          onSave={handleCreate}
          onCancel={() => setAddingTo(null)}
          isPending={createCategory.isPending}
          placeholder="Nome do grupo..."
        />
      )}

      <div className="rounded-lg border bg-card divide-y">
        {groups.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-6">Nenhuma categoria cadastrada</div>
        )}
        {groups.map((group) => {
          const isExpanded = expandedGroups.has(group.id);
          const children = childrenMap.get(group.id) || [];
          const isEditing = editingId === group.id;

          return (
            <div key={group.id}>
              {/* Group row */}
              <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 transition-colors">
                <button onClick={() => toggleGroup(group.id)} className="p-0.5 rounded hover:bg-muted">
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isEditing ? (
                  <InlineForm
                    name={editName}
                    setName={setEditName}
                    color={editColor}
                    setColor={setEditColor}
                    onSave={saveEdit}
                    onCancel={() => setEditingId(null)}
                    isPending={updateCategory.isPending}
                    placeholder="Nome do grupo..."
                    inline
                  />
                ) : (
                  <>
                    <Badge variant="outline" className={`text-xs ${colorClasses[group.color] || colorClasses.gray}`}>
                      {group.name}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-1">({children.length})</span>
                    {!group.is_active && (
                      <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                    )}
                    <div className="flex-1" />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(group)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleActive(group)} title={group.is_active ? "Desativar" : "Ativar"}>
                      {group.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setAddingTo(group.id); setNewName(""); setNewColor(group.color); setExpandedGroups((p) => new Set(p).add(group.id)); }} title="Adicionar subcategoria">
                      <FolderPlus className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>

              {/* Children */}
              {isExpanded && (
                <div className="bg-muted/20">
                  {children.map((child) => {
                    const isChildEditing = editingId === child.id;
                    return (
                      <div key={child.id} className="flex items-center gap-2 pl-10 pr-3 py-2 hover:bg-muted/50 transition-colors border-t border-border/50">
                        {isChildEditing ? (
                          <InlineForm
                            name={editName}
                            setName={setEditName}
                            color={editColor}
                            setColor={setEditColor}
                            onSave={saveEdit}
                            onCancel={() => setEditingId(null)}
                            isPending={updateCategory.isPending}
                            placeholder="Nome da subcategoria..."
                            inline
                          />
                        ) : (
                          <>
                            <span className="text-sm">{child.name}</span>
                            {!child.is_active && (
                              <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                            )}
                            <div className="flex-1" />
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(child)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleActive(child)} title={child.is_active ? "Desativar" : "Ativar"}>
                              {child.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Add subcategory inline */}
                  {addingTo === group.id && (
                    <div className="pl-10 pr-3 py-2 border-t border-border/50">
                      <InlineForm
                        name={newName}
                        setName={setNewName}
                        color={newColor}
                        setColor={setNewColor}
                        onSave={handleCreate}
                        onCancel={() => setAddingTo(null)}
                        isPending={createCategory.isPending}
                        placeholder="Nome da subcategoria..."
                        inline
                      />
                    </div>
                  )}

                  {children.length === 0 && addingTo !== group.id && (
                    <div className="pl-10 pr-3 py-2 text-xs text-muted-foreground border-t border-border/50">
                      Sem subcategorias
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Inline form for create / edit ── */

function InlineForm({
  name, setName, color, setColor, onSave, onCancel, isPending, placeholder, inline,
}: {
  name: string;
  setName: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
  placeholder: string;
  inline?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${inline ? "flex-1" : "rounded-lg border bg-card px-3 py-2"}`}>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-sm flex-1"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`h-5 w-5 rounded-full border-2 transition-all ${
              c === color ? "border-foreground scale-110" : "border-transparent"
            }`}
            style={{ backgroundColor: `var(--color-${c}, ${c})` }}
            title={c}
          >
            <span className={`block h-full w-full rounded-full ${colorClasses[c]?.split(" ")[0] || "bg-muted"}`} />
          </button>
        ))}
      </div>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onSave} disabled={isPending || !name.trim()}>
        <Check className="h-4 w-4 text-green-600" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancel}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
