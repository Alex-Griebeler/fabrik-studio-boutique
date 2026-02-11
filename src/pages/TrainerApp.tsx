import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useTrainerTodaySessions,
  useTrainerCheckin,
  useCompleteSession,
  requestGeolocation,
  takeCheckinPhoto,
} from "@/hooks/useTrainerCheckin";
import { useCurrentTrainerId } from "@/hooks/useTrainerPayroll";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  MapPin,
  Camera,
  CheckCircle2,
  Clock,
  User,
  Play,
  Square,
  Loader2,
  AlertTriangle,
  Dumbbell,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CheckinMethod = "manual" | "gps" | "photo";

export default function TrainerApp() {
  const { data: trainer, isLoading: trainerLoading } = useCurrentTrainerId();
  const { data: sessions, isLoading: sessionsLoading } = useTrainerTodaySessions();
  const checkin = useTrainerCheckin();
  const completeSession = useCompleteSession();

  const [checkinSessionId, setCheckinSessionId] = useState<string | null>(null);
  const [checkinLoading, setCheckinLoading] = useState(false);

  const handleCheckin = async (sessionId: string, method: CheckinMethod) => {
    setCheckinLoading(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      let photoUrl: string | undefined;

      if (method === "gps") {
        const pos = await requestGeolocation();
        lat = pos.lat;
        lng = pos.lng;
      }

      if (method === "photo") {
        const photo = await takeCheckinPhoto();
        if (photo) photoUrl = photo;
        // Also get GPS
        try {
          const pos = await requestGeolocation();
          lat = pos.lat;
          lng = pos.lng;
        } catch { /* GPS optional with photo */ }
      }

      await checkin.mutateAsync({ sessionId, method, lat, lng, photoUrl });
      setCheckinSessionId(null);
    } catch { /* error handled by mutation */ }
    setCheckinLoading(false);
  };

  if (trainerLoading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!trainer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mb-4 opacity-40" />
            <p className="text-sm font-medium">Perfil não vinculado a um treinador</p>
            <p className="text-xs mt-1">Solicite ao administrador.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const today = format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR });

  const now = new Date();
  const currentTime = format(now, "HH:mm");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-5 pb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
            <Dumbbell className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm opacity-80">Olá,</p>
            <h1 className="text-lg font-bold">{trainer.full_name}</h1>
          </div>
        </div>
        <p className="text-xs mt-2 opacity-70 capitalize">{today}</p>
      </div>

      {/* Sessions */}
      <div className="px-4 -mt-4 space-y-3 pb-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Sessões de hoje ({sessions?.length ?? 0})
        </h2>

        {sessionsLoading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : !sessions?.length ? (
          <Card className="rounded-xl">
            <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
              <Clock className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Nenhuma sessão para hoje</p>
            </CardContent>
          </Card>
        ) : (
          sessions.map((s) => {
            const isCheckedIn = !!s.trainer_checkin_at;
            const isCompleted = s.status === "completed";
            const isInProgress = isCheckedIn && !isCompleted;
            const sessionTime = s.start_time?.slice(0, 5);
            const endTime = s.end_time?.slice(0, 5);
            const isPast = sessionTime && sessionTime < currentTime;
            const studentName = (s as any).students?.full_name;

            return (
              <Card
                key={s.id}
                className={cn(
                  "rounded-xl transition-all",
                  isCompleted && "opacity-60",
                  isInProgress && !isCompleted && "border-primary/50 shadow-md"
                )}
              >
                <CardContent className="p-4">
                  {/* Time + Status */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-base">
                        {sessionTime} – {endTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isCheckedIn && (
                        <Badge className="bg-success/20 text-success border-success/30 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Check-in
                        </Badge>
                      )}
                      <Badge variant={isCompleted ? "secondary" : "outline"} className="text-xs capitalize">
                        {s.status === "scheduled" ? "agendada" :
                         s.status === "completed" ? "concluída" : s.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <Dumbbell className="h-3.5 w-3.5" />
                      {s.modality}
                    </span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {s.session_type}
                    </Badge>
                    {studentName && (
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {studentName}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {!isCheckedIn && !isCompleted && (
                      <Button
                        className="flex-1 h-12 text-base font-semibold"
                        onClick={() => setCheckinSessionId(s.id)}
                      >
                        <MapPin className="h-5 w-5 mr-2" />
                        Fazer Check-in
                      </Button>
                    )}
                    {isCheckedIn && !isCompleted && (
                      <Button
                        variant="secondary"
                        className="flex-1 h-12 text-base"
                        onClick={() => completeSession.mutate(s.id)}
                        disabled={completeSession.isPending}
                      >
                        <Square className="h-4 w-4 mr-2" />
                        Finalizar Sessão
                      </Button>
                    )}
                    {isCompleted && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        Sessão concluída
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Check-in Dialog */}
      <Dialog open={!!checkinSessionId} onOpenChange={(open) => !open && setCheckinSessionId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fazer Check-in</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Escolha o método de check-in:
            </p>

            <Button
              variant="outline"
              className="w-full h-14 justify-start gap-3 text-left"
              disabled={checkinLoading}
              onClick={() => checkinSessionId && handleCheckin(checkinSessionId, "gps")}
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Geolocalização (GPS)</p>
                <p className="text-xs text-muted-foreground">Registrar localização automaticamente</p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full h-14 justify-start gap-3 text-left"
              disabled={checkinLoading}
              onClick={() => checkinSessionId && handleCheckin(checkinSessionId, "photo")}
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Camera className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Foto + GPS</p>
                <p className="text-xs text-muted-foreground">Tirar foto e registrar localização</p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full h-14 justify-start gap-3 text-left"
              disabled={checkinLoading}
              onClick={() => checkinSessionId && handleCheckin(checkinSessionId, "manual")}
            >
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">Check-in Manual</p>
                <p className="text-xs text-muted-foreground">Sem localização ou foto</p>
              </div>
            </Button>

            {checkinLoading && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando check-in...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
