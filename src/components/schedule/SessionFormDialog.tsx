import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateSession, MODALITY_LABELS, ClassModality, useInstructors } from "@/hooks/useSchedule";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
}

export function SessionFormDialog({ open, onOpenChange, defaultDate }: Props) {
  const [modality, setModality] = useState<ClassModality>("btb");
  const [date, setDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("07:00");
  const [duration, setDuration] = useState("60");
  const [capacity, setCapacity] = useState("12");
  const [instructorId, setInstructorId] = useState("");
  const [notes, setNotes] = useState("");

  const createSession = useCreateSession();
  const { data: instructors } = useInstructors();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Aula</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Modalidade</Label>
              <Select value={modality} onValueChange={(v) => setModality(v as ClassModality)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(MODALITY_LABELS) as [ClassModality, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
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
            <Button type="submit" disabled={createSession.isPending}>Criar Aula</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
