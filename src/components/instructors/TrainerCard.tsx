import { useState } from "react";
import { Phone, Mail, Calendar, Trash2, Pencil, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteTrainer, useTrainerSessionStats } from "@/hooks/useTrainers";
import type { Trainer } from "@/hooks/schedule/types";

interface Props {
  trainer: Trainer;
  onEdit: (t: Trainer) => void;
}

const payMethodLabel: Record<string, string> = {
  hourly: "Por hora",
  per_session: "Por sessão",
  hybrid: "Híbrido",
};

export function TrainerCard({ trainer, onEdit }: Props) {
  const [showDelete, setShowDelete] = useState(false);
  const del = useDeleteTrainer();
  const { data: stats } = useTrainerSessionStats(trainer.id);

  const initials = trainer.full_name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const mainRate = (trainer.hourly_rate_main_cents / 100).toFixed(0);

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h3 className="font-display font-semibold text-sm truncate">{trainer.full_name}</h3>
                  {!trainer.is_active && <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">Inativo</Badge>}
                </div>
                <div className="flex gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => onEdit(trainer)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setShowDelete(true)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1 mt-1">
                {trainer.email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3 w-3" /> {trainer.email}
                  </p>
                )}
                {trainer.phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Phone className="h-3 w-3" /> {trainer.phone}
                  </p>
                )}
              </div>

              <div className="flex gap-1.5 mt-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  <DollarSign className="h-3 w-3 mr-0.5" />
                  R${mainRate}/h · {payMethodLabel[trainer.payment_method] || trainer.payment_method}
                </Badge>
                {stats && (
                  <>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      <Calendar className="h-3 w-3 mr-0.5" />
                      {stats.upcomingCount} próximas
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {stats.pastWeekCount} última sem.
                    </Badge>
                  </>
                )}
              </div>

              {trainer.specialties && trainer.specialties.length > 0 && (
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {trainer.specialties.slice(0, 3).map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px] px-1 py-0 font-normal">{s}</Badge>
                  ))}
                  {trainer.specialties.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">+{trainer.specialties.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover treinador?</AlertDialogTitle>
            <AlertDialogDescription>
              {trainer.full_name} será removido. Sessões já agendadas não serão afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => del.mutate(trainer.id)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
