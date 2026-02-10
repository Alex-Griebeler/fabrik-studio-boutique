import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateSession, useUpdateSession, useActiveModalities, useInstructors, ClassSession } from "@/hooks/useSchedule";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  editSession?: ClassSession | null;
}

export function SessionFormDialog({ open, onOpenChange, defaultDate, editSession }: Props) {
  const [modality, setModality] = useState("");
  const [date, setDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("07:00");
  const [duration, setDuration] = useState("60");
  const [capacity, setCapacity] = useState("12");
  const [instructorId, setInstructorId] = useState("");
  const [notes, setNotes] = useState("");

  const createSession = useCreateSession();
  const updateSession = useUpdateSession();
  const { data: modalities } = useActiveModalities();
  const { data: instructors } = useInstructors();

  const isEditing = !!editSession;

  useEffect(() => {
    if (editSession) {
      setModality(editSession.modality);
      setDate(editSession.session_date);
      setStartTime(editSession.start_time.slice(0, 5));
      setDuration(String(editSession.duration_minutes));
      setCapacity(String(editSession.capacity));
      setInstructorId(editSession.instructor_id || "");
      setNotes(editSession.notes || "");
    } else {
      setModality("");
      setDate(defaultDate || new Date().toISOString().slice(0, 10));
      setStartTime("07:00");
      setDuration("60");
      setCapacity("12");
      setInstructorId("");
      setNotes("");
    }
  }, [editSession, defaultDate, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modality) return;
    if (isEditing) {
      updateSession.mutate(
        {
          id: editSession.id,
          session_date: date,
          start_time: startTime,
          duration_minutes: parseInt(duration),
          modality,
          capacity: parseInt(capacity),
          instructor_id: instructorId || null,
          notes: notes || null,
        },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createSession.mutate(
        {
          session_date: date,
          start_time: startTime,
          duration_minutes: parseInt(duration),
          modality,
          capacity: parseInt(capacity),
          instructor_id: instructorId || null,
          notes: notes || null,
        },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const isPending = isEditing ? updateSession.isPending : createSession.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Aula" : "Nova Aula"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
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
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Horário</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </div>
            <div>
              <Label>Duração (min)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min={15} max={180} required />
            </div>
            <div>
              <Label>Vagas</Label>
              <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} min={1} max={50} required />
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
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending || !modality}>
              {isEditing ? "Salvar" : "Criar Aula"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
