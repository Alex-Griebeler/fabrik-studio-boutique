import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  useCreateInteraction,
  interactionTypeLabels,
  type InteractionType,
  type InteractionFormData,
} from "@/hooks/useLeads";

const types: InteractionType[] = ["phone_call", "whatsapp", "email", "visit", "trial_class", "follow_up", "note"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
}

export function InteractionFormDialog({ open, onOpenChange, studentId }: Props) {
  const createInteraction = useCreateInteraction();

  const [form, setForm] = useState<Omit<InteractionFormData, "student_id">>({
    type: "phone_call",
    description: "",
    scheduled_at: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createInteraction.mutate(
      { ...form, student_id: studentId },
      {
        onSuccess: () => {
          onOpenChange(false);
          setForm({ type: "phone_call", description: "", scheduled_at: "" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Interação</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as InteractionType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>{interactionTypeLabels[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Detalhes da interação..."
              rows={3}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Agendado para</Label>
            <Input
              type="datetime-local"
              value={form.scheduled_at || ""}
              onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createInteraction.isPending || !form.description.trim()}>
              {createInteraction.isPending ? "Salvando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
