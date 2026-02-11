import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTrialQuota, useCheckTrialAvailability, useBookTrial } from "@/hooks/useTrialQuotas";
import { format } from "date-fns";

const HOURS = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
}

export function TrialScheduler({ open, onOpenChange, leadId }: Props) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [trialType, setTrialType] = useState("group");

  const { data: quota } = useTrialQuota(date);
  const { check } = useCheckTrialAvailability();
  const bookTrial = useBookTrial();

  const availability = date && time ? check(quota, time) : { available: true };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) return;
    bookTrial.mutate(
      { leadId, date, time, trialType },
      { onSuccess: () => { onOpenChange(false); setDate(""); setTime(""); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar Trial</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Data *</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={format(new Date(), "yyyy-MM-dd")}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Horário *</Label>
            <Select value={time} onValueChange={setTime}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => {
                  const slotCheck = date ? check(quota, h) : { available: true };
                  return (
                    <SelectItem key={h} value={h} disabled={!slotCheck.available}>
                      {h} {!slotCheck.available && "(ocupado)"}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {date && quota && (
              <p className="text-xs text-muted-foreground">
                {quota.trials_booked}/{quota.max_trials} trials agendados neste dia
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={trialType} onValueChange={setTrialType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="group">Grupo</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!availability.available && (
            <p className="text-sm text-destructive">{availability.reason}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={bookTrial.isPending || !date || !time || !availability.available}>
              {bookTrial.isPending ? "Agendando..." : "Confirmar Trial"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
