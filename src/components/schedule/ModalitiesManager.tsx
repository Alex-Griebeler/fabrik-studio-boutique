import { useState } from "react";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useModalities,
  useCreateModality,
  useUpdateModality,
  useDeleteModality,
  getModalityColor,
  ClassModality,
} from "@/hooks/useSchedule";
import { cn } from "@/lib/utils";

const AVAILABLE_COLORS = [
  { value: "primary", label: "Terracotta" },
  { value: "destructive", label: "Vermelho" },
  { value: "info", label: "Azul" },
  { value: "success", label: "Verde" },
  { value: "warning", label: "Amarelo" },
  { value: "secondary", label: "Cinza" },
  { value: "purple", label: "Roxo" },
  { value: "pink", label: "Rosa" },
  { value: "orange", label: "Laranja" },
  { value: "teal", label: "Turquesa" },
  { value: "indigo", label: "Índigo" },
  { value: "cyan", label: "Ciano" },
];

export function ModalitiesManager() {
  const { data: modalities, isLoading } = useModalities();
  const createModality = useCreateModality();
  const updateModality = useUpdateModality();
  const deleteModality = useDeleteModality();

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ClassModality | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClassModality | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [color, setColor] = useState("primary");

  const openNew = () => {
    setEditing(null);
    setName("");
    setSlug("");
    setColor("primary");
    setEditOpen(true);
  };

  const openEdit = (m: ClassModality) => {
    setEditing(m);
    setName(m.name);
    setSlug(m.slug);
    setColor(m.color);
    setEditOpen(true);
  };

  const handleSave = () => {
    if (!name.trim() || !slug.trim()) return;
    if (editing) {
      updateModality.mutate(
        { id: editing.id, name, slug, color },
        { onSuccess: () => setEditOpen(false) }
      );
    } else {
      const nextOrder = (modalities?.length ?? 0) + 1;
      createModality.mutate(
        { name, slug: slug.toLowerCase().replace(/\s+/g, "_"), color, sort_order: nextOrder },
        { onSuccess: () => setEditOpen(false) }
      );
    }
  };

  const handleToggleActive = (m: ClassModality) => {
    updateModality.mutate({ id: m.id, is_active: !m.is_active });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteModality.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  // Auto-generate slug from name
  const handleNameChange = (val: string) => {
    setName(val);
    if (!editing) {
      setSlug(val.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Modalidades</h3>
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-1.5">
          {modalities?.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 transition-opacity",
                !m.is_active && "opacity-50"
              )}
            >
              <Badge className={cn("text-xs", getModalityColor(m.color))} variant="outline">
                {m.name}
              </Badge>
              <span className="text-xs text-muted-foreground flex-1">{m.slug}</span>
              <Switch
                checked={m.is_active}
                onCheckedChange={() => handleToggleActive(m)}
                className="scale-75"
              />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(m)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Modalidade" : "Nova Modalidade"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Ex: Funcional" />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="funcional" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Identificador único, sem espaços</p>
            </div>
            <div>
              <Label>Cor</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AVAILABLE_COLORS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="flex items-center gap-2">
                        <span className={cn("w-3 h-3 rounded-full shrink-0", {
                          "bg-primary": c.value === "primary",
                          "bg-destructive": c.value === "destructive",
                          "bg-info": c.value === "info",
                          "bg-success": c.value === "success",
                          "bg-warning": c.value === "warning",
                          "bg-secondary": c.value === "secondary",
                          "bg-purple-500": c.value === "purple",
                          "bg-pink-500": c.value === "pink",
                          "bg-orange-500": c.value === "orange",
                          "bg-teal-500": c.value === "teal",
                          "bg-indigo-500": c.value === "indigo",
                          "bg-cyan-500": c.value === "cyan",
                        })} />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={!name.trim() || !slug.trim()}>
                {editing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modalidade?</AlertDialogTitle>
            <AlertDialogDescription>
              A modalidade "{deleteTarget?.name}" será removida permanentemente. Aulas vinculadas podem ser afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
