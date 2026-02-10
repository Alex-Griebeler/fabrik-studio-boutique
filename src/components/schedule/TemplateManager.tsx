import { useState } from "react";
import { Plus, Pencil, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
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
  useClassTemplates,
  useCreateTemplate,
  useDeleteTemplate,
  useActiveModalities,
  useInstructors,
  getModalityColor,
  ClassTemplate,
} from "@/hooks/useSchedule";
import { cn } from "@/lib/utils";

const DAYS = [
  { value: 0, short: "Dom", label: "Domingo" },
  { value: 1, short: "Seg", label: "Segunda" },
  { value: 2, short: "Ter", label: "Terça" },
  { value: 3, short: "Qua", label: "Quarta" },
  { value: 4, short: "Qui", label: "Quinta" },
  { value: 5, short: "Sex", label: "Sexta" },
  { value: 6, short: "Sáb", label: "Sábado" },
];

export function TemplateManager() {
  const { data: templates, isLoading } = useClassTemplates();
  const { data: modalities } = useActiveModalities();
  const { data: instructors } = useInstructors();
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClassTemplate | null>(null);

  // Form state
  const [modality, setModality] = useState("");
  const [startTime, setStartTime] = useState("07:00");
  const [duration, setDuration] = useState("60");
  const [capacity, setCapacity] = useState("12");
  const [instructorId, setInstructorId] = useState("");
  const [location, setLocation] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  const openNew = () => {
    setModality("");
    setStartTime("07:00");
    setDuration("60");
    setCapacity("12");
    setInstructorId("");
    setLocation("");
    setSelectedDays([]);
    setFormOpen(true);
  };

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSave = () => {
    if (!modality || selectedDays.length === 0) return;

    // Create one template per selected day
    const promises = selectedDays.map((day) =>
      createTemplate.mutateAsync({
        modality,
        day_of_week: day,
        start_time: startTime,
        duration_minutes: parseInt(duration),
        capacity: parseInt(capacity),
        instructor_id: instructorId || null,
        location: location || null,
        is_active: true,
      })
    );

    Promise.all(promises).then(() => setFormOpen(false));
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteTemplate.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  // Group templates by modality+time for display
  const grouped = templates?.reduce((acc, t) => {
    const key = `${t.modality}_${t.start_time}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {} as Record<string, ClassTemplate[]>);

  const modalityMap = modalities?.reduce((acc, m) => {
    acc[m.slug] = m;
    return acc;
  }, {} as Record<string, { name: string; color: string }>);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Grade Fixa Semanal</h3>
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova Grade
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : !templates?.length ? (
        <p className="text-xs text-muted-foreground">Nenhuma grade cadastrada. Crie a primeira!</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(grouped ?? {}).map(([key, items]) => {
            const first = items[0];
            const mod = modalityMap?.[first.modality];
            const days = items.map((i) => i.day_of_week).sort();
            return (
              <div
                key={key}
                className="rounded-lg border px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn("text-xs", getModalityColor(mod?.color || "primary"))}
                    variant="outline"
                  >
                    {mod?.name || first.modality}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {first.start_time.slice(0, 5)} · {first.duration_minutes}min · {first.capacity} vagas
                  </span>
                  {first.instructor?.full_name && (
                    <span className="text-xs text-muted-foreground">
                      · {first.instructor.full_name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {DAYS.map((d) => (
                    <Badge
                      key={d.value}
                      variant={days.includes(d.value) ? "default" : "outline"}
                      className={cn(
                        "text-[10px] px-1.5 py-0",
                        !days.includes(d.value) && "opacity-30"
                      )}
                    >
                      {d.short}
                    </Badge>
                  ))}
                  <div className="ml-auto flex gap-0.5">
                    {items.map((t) => (
                      <Button
                        key={t.id}
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setDeleteTarget(t)}
                        title={`Excluir ${DAYS.find((d) => d.value === t.day_of_week)?.label}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Template Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Grade Fixa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Modalidade</Label>
              <Select value={modality} onValueChange={setModality}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {modalities?.map((m) => (
                    <SelectItem key={m.id} value={m.slug}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block">Dias da Semana</Label>
              <div className="flex gap-1.5">
                {DAYS.map((d) => (
                  <Toggle
                    key={d.value}
                    pressed={selectedDays.includes(d.value)}
                    onPressedChange={() => toggleDay(d.value)}
                    size="sm"
                    variant="outline"
                    className={cn(
                      "h-9 w-9 p-0 text-xs font-medium rounded-full",
                      selectedDays.includes(d.value) && "bg-primary text-primary-foreground"
                    )}
                  >
                    {d.short}
                  </Toggle>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Horário</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
              </div>
              <div>
                <Label>Duração (min)</Label>
                <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min={15} max={180} />
              </div>
              <div>
                <Label>Vagas</Label>
                <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} min={1} max={50} />
              </div>
            </div>

            <div>
              <Label>Instrutor</Label>
              <Select value={instructorId} onValueChange={setInstructorId}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  {instructors?.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Local</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Sala 1" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button
                onClick={handleSave}
                disabled={!modality || selectedDays.length === 0 || createTemplate.isPending}
              >
                {createTemplate.isPending ? "Criando..." : `Criar em ${selectedDays.length} dia(s)`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir grade?</AlertDialogTitle>
            <AlertDialogDescription>
              A grade de "{modalityMap?.[deleteTarget?.modality ?? ""]?.name ?? deleteTarget?.modality}" 
              ({DAYS.find((d) => d.value === deleteTarget?.day_of_week)?.label}) 
              às {deleteTarget?.start_time?.slice(0, 5)} será removida.
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
