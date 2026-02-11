import { useState, useMemo } from "react";
import { AlertTriangle, Clock, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Session, useCancelSession } from "@/hooks/useSchedule";
import { usePolicyValue } from "@/hooks/usePolicies";
import { cn } from "@/lib/utils";

interface CancelSessionDialogProps {
  session: Session | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CancelSessionDialog({ session, open, onOpenChange }: CancelSessionDialogProps) {
  const [reason, setReason] = useState("");
  const cancelSession = useCancelSession();

  const cutoffHours = usePolicyValue<number>(
    session?.session_type === "personal"
      ? "personal_cancellation_cutoff_hours"
      : "group_cancellation_cutoff_hours",
    12
  );

  const { hoursUntil, isWithinCutoff } = useMemo(() => {
    if (!session) return { hoursUntil: 0, isWithinCutoff: true };
    const sessionStart = new Date(`${session.session_date}T${session.start_time}`);
    const hours = (sessionStart.getTime() - Date.now()) / (1000 * 60 * 60);
    return { hoursUntil: Math.max(0, hours), isWithinCutoff: hours >= cutoffHours };
  }, [session, cutoffHours]);

  const handleCancel = () => {
    if (!session || !reason.trim()) return;
    cancelSession.mutate(
      { session, reason: reason.trim(), cutoffHours },
      {
        onSuccess: () => {
          setReason("");
          onOpenChange(false);
        },
      }
    );
  };

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Cancelar Sessão
          </DialogTitle>
          <DialogDescription>
            {session.modality} — {session.session_date} às {session.start_time.slice(0, 5)}
          </DialogDescription>
        </DialogHeader>

        {/* Cutoff indicator */}
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border p-3",
            isWithinCutoff
              ? "bg-success/10 border-success/30"
              : "bg-destructive/10 border-destructive/30"
          )}
        >
          {isWithinCutoff ? (
            <ShieldCheck className="h-5 w-5 text-success shrink-0 mt-0.5" />
          ) : (
            <ShieldX className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          )}
          <div className="text-sm space-y-1">
            <p className="font-medium">
              {isWithinCutoff ? "Dentro do prazo" : "Fora do prazo"}
            </p>
            <p className="text-xs text-muted-foreground">
              <Clock className="h-3 w-3 inline mr-1" />
              {hoursUntil.toFixed(1)}h até a sessão (mínimo: {cutoffHours}h)
            </p>
            <p className="text-xs text-muted-foreground">
              {isWithinCutoff
                ? session.session_type === "personal"
                  ? "O treinador não será remunerado. Um crédito de reposição será gerado para o aluno."
                  : "O treinador não será remunerado por esta sessão."
                : "O treinador será remunerado normalmente. Nenhum crédito de reposição será gerado."}
            </p>
          </div>
        </div>

        {/* Reason */}
        <div className="space-y-2">
          <Label htmlFor="cancel-reason">
            Motivo do cancelamento <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Descreva o motivo do cancelamento..."
            className="min-h-[80px]"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={!reason.trim() || cancelSession.isPending}
          >
            {cancelSession.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
