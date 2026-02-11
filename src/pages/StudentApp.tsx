import { useState } from "react";
import { format, isToday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  MapPin, Camera, CheckCircle2, CalendarDays, User, Star,
  Clock, Dumbbell, ArrowRight, Phone, Mail, Heart, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  useCurrentStudent,
  useStudentUpcomingSessions,
  useStudentSessionHistory,
  useStudentCredits,
  useStudentActiveContract,
  useStudentCheckin,
  type SessionWithTrainer,
  type ContractWithPlan,
} from "@/hooks/useStudentApp";
import { requestGeolocation, takeCheckinPhoto } from "@/hooks/useTrainerCheckin";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function StudentApp() {
  const { signOut } = useAuth();
  const { data: student, isLoading: loadingStudent } = useCurrentStudent();
  const { data: sessions, isLoading: loadingSessions } = useStudentUpcomingSessions(student?.id);
  const { data: history } = useStudentSessionHistory(student?.id);
  const { data: credits } = useStudentCredits(student?.id);
  const { data: contract } = useStudentActiveContract(student?.id);
  const checkinMutation = useStudentCheckin();
  const [checkinLoadingId, setCheckinLoadingId] = useState<string | null>(null);

  const availableCredits = credits?.filter((c) => c.status === "available") ?? [];
  const completedCount = history?.length ?? 0;

  const handleCheckin = async (sessionId: string, method: "manual" | "gps" | "photo") => {
    setCheckinLoadingId(sessionId);
    try {
      let lat: number | undefined;
      let lng: number | undefined;

      if (method === "gps") {
        const pos = await requestGeolocation();
        lat = pos.lat;
        lng = pos.lng;
      }

      if (method === "photo") {
        const photo = await takeCheckinPhoto();
        if (!photo) {
          toast.info("Câmera não disponível, usando check-in manual.");
          method = "manual";
        }
      }

      await checkinMutation.mutateAsync({ sessionId, method, lat, lng });
    } catch (err: any) {
      toast.error(err.message || "Erro no check-in");
    } finally {
      setCheckinLoadingId(null);
    }
  };

  if (loadingStudent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="space-y-4 w-full max-w-md">
          <Skeleton className="h-12 w-3/4 mx-auto" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <User className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Cadastro não encontrado</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Seu usuário não está vinculado a um cadastro de aluno.
        </p>
        <Button variant="outline" onClick={signOut}>Sair</Button>
      </div>
    );
  }

  const todaySessions = sessions?.filter((s) => isToday(parseISO(s.session_date))) ?? [];
  const futureSessions = sessions?.filter((s) => !isToday(parseISO(s.session_date))) ?? [];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 pt-10 pb-6">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <p className="text-sm opacity-80">Olá,</p>
            <h1 className="text-xl font-bold">{student.full_name.split(" ")[0]}</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-primary-foreground/70 hover:text-primary-foreground">
            Sair
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3 mt-4 max-w-lg mx-auto">
          <div className="bg-primary-foreground/10 rounded-xl px-3 py-2 text-center">
            <p className="text-2xl font-bold">{completedCount}</p>
            <p className="text-[10px] uppercase tracking-wider opacity-70">Aulas</p>
          </div>
          <div className="bg-primary-foreground/10 rounded-xl px-3 py-2 text-center">
            <p className="text-2xl font-bold">{availableCredits.length}</p>
            <p className="text-[10px] uppercase tracking-wider opacity-70">Créditos</p>
          </div>
          <div className="bg-primary-foreground/10 rounded-xl px-3 py-2 text-center">
            <p className="text-2xl font-bold">{todaySessions.length}</p>
            <p className="text-[10px] uppercase tracking-wider opacity-70">Hoje</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 -mt-2">
        <Tabs defaultValue="today" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 bg-muted/50">
            <TabsTrigger value="today" className="text-xs gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Hoje
            </TabsTrigger>
            <TabsTrigger value="schedule" className="text-xs gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> Agenda
            </TabsTrigger>
            <TabsTrigger value="credits" className="text-xs gap-1">
              <Star className="h-3.5 w-3.5" /> Créditos
            </TabsTrigger>
            <TabsTrigger value="profile" className="text-xs gap-1">
              <User className="h-3.5 w-3.5" /> Perfil
            </TabsTrigger>
          </TabsList>

          {/* TAB: Hoje */}
          <TabsContent value="today" className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </h2>

            {loadingSessions ? (
              <Skeleton className="h-28 w-full" />
            ) : todaySessions.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center py-10 text-muted-foreground">
                  <Dumbbell className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">Sem aulas hoje</p>
                  <p className="text-xs mt-1 opacity-60">Confira sua agenda para próximas aulas</p>
                </CardContent>
              </Card>
            ) : (
              todaySessions.map((session) => {
                const hasCheckin = !!session.student_checkin_at;
                const isLoading = checkinLoadingId === session.id;

                return (
                  <Card key={session.id} className={hasCheckin ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/10" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold">{session.modality}</p>
                          <p className="text-sm text-muted-foreground">
                            {session.start_time?.slice(0, 5)} – {session.end_time?.slice(0, 5)}
                          </p>
                          {session.trainers?.full_name && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Prof. {session.trainers.full_name}
                            </p>
                          )}
                        </div>
                        {hasCheckin ? (
                          <Badge variant="default" className="text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Presente
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Agendada</Badge>
                        )}
                      </div>

                      {!hasCheckin && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 text-xs"
                            onClick={() => handleCheckin(session.id, "manual")}
                            disabled={isLoading}
                          >
                            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                            Check-in
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => handleCheckin(session.id, "gps")}
                            disabled={isLoading}
                          >
                            <MapPin className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => handleCheckin(session.id, "photo")}
                            disabled={isLoading}
                          >
                            <Camera className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* TAB: Agenda */}
          <TabsContent value="schedule" className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Próximas Aulas</h2>

            {futureSessions && futureSessions.length > 0 ? (
              futureSessions.map((session) => (
                <Card key={session.id}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="bg-primary/10 text-primary rounded-lg px-3 py-2 text-center min-w-[56px]">
                      <p className="text-lg font-bold leading-none">
                        {format(parseISO(session.session_date), "dd")}
                      </p>
                      <p className="text-[10px] uppercase mt-0.5">
                        {format(parseISO(session.session_date), "MMM", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{session.modality}</p>
                      <p className="text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {session.start_time?.slice(0, 5)} – {session.end_time?.slice(0, 5)}
                      </p>
                      {session.trainers?.full_name && (
                        <p className="text-xs text-muted-foreground">
                          Prof. {session.trainers.full_name}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center py-10 text-muted-foreground">
                  <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">Nenhuma aula agendada</p>
                </CardContent>
              </Card>
            )}

            {/* History */}
            {history && history.length > 0 && (
              <>
                <Separator className="my-2" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Histórico</h2>
                {history.slice(0, 10).map((session) => (
                  <div key={session.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                    <div className="text-xs text-muted-foreground w-16 shrink-0">
                      {format(parseISO(session.session_date), "dd/MM")}
                    </div>
                    <p className="text-sm flex-1 truncate">{session.modality}</p>
                    <Badge variant="secondary" className="text-[10px]">
                      {session.start_time?.slice(0, 5)}
                    </Badge>
                  </div>
                ))}
              </>
            )}
          </TabsContent>

          {/* TAB: Créditos */}
          <TabsContent value="credits" className="space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="h-4 w-4 text-accent-foreground" /> Créditos de Reposição
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-primary">{availableCredits.length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Disponíveis</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-muted-foreground">
                      {credits?.filter((c) => c.status === "used").length ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase">Usados</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-destructive">
                      {credits?.filter((c) => c.status === "expired").length ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase">Expirados</p>
                  </div>
                </div>

                {availableCredits.length > 0 && (
                  <div className="space-y-2">
                    <Separator />
                    <p className="text-xs font-medium text-muted-foreground mt-2">Créditos disponíveis:</p>
                    {availableCredits.map((credit) => (
                      <div key={credit.id} className="flex items-center justify-between py-1.5 text-sm">
                        <span>Crédito de reposição</span>
                        <span className="text-xs text-muted-foreground">
                          {credit.expires_at
                            ? `Expira ${format(new Date(credit.expires_at), "dd/MM")}`
                            : "Sem vencimento"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contract info */}
            {contract && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Meu Plano</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plano</span>
                    <span className="font-medium">{contract.plan?.name ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frequência</span>
                    <span className="font-medium">{contract.plan?.frequency ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Início</span>
                    <span>{format(parseISO(contract.start_date), "dd/MM/yyyy")}</span>
                  </div>
                  {contract.end_date && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Término</span>
                      <span>{format(parseISO(contract.end_date), "dd/MM/yyyy")}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* TAB: Perfil */}
          <TabsContent value="profile" className="space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" /> Meus Dados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="Nome" value={student.full_name} />
                <InfoRow label="Email" value={student.email} icon={<Mail className="h-3.5 w-3.5" />} />
                <InfoRow label="Telefone" value={student.phone} icon={<Phone className="h-3.5 w-3.5" />} />
                <InfoRow label="CPF" value={student.cpf} />
                {student.date_of_birth && (
                  <InfoRow
                    label="Nascimento"
                    value={format(parseISO(student.date_of_birth + "T00:00:00"), "dd/MM/yyyy")}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Heart className="h-4 w-4 text-primary" /> Saúde
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Condições Médicas</p>
                  <p className={student.medical_conditions ? "" : "text-muted-foreground/60 italic"}>
                    {student.medical_conditions || "Nenhuma registrada"}
                  </p>
                </div>
                <Separator />
                <InfoRow label="Contato Emergência" value={student.emergency_contact_name} />
                <InfoRow label="Tel. Emergência" value={student.emergency_contact_phone} icon={<Phone className="h-3.5 w-3.5" />} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string | null | undefined; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={value ? "" : "text-muted-foreground/60 italic"}>
          {value || "Não informado"}
        </p>
      </div>
    </div>
  );
}
