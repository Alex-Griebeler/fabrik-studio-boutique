import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateSession,
  useUpdateSession,
  useUpdateThisAndFollowing,
  useUpdateAllOccurrences,
  useActiveModalities,
  Session,
} from "@/hooks/useSchedule";
import { useTrainers } from "@/hooks/useTrainers";
import { useStudents } from "@/hooks/useStudents";
import { useServiceTypes, useTrainerServiceRates, pairKey } from "@/hooks/useServiceRates";
import { sessionPaymentSnapshot } from "@/lib/sessionPayment";
import { toast } from "sonner";
import { RecurringAction } from "./RecurringActionDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  editSession?: Session | null;
  recurringAction?: RecurringAction | null;
}

export function SessionFormDialog({ open, onOpenChange, defaultDate, editSession, recurringAction }: Props) {
  const [sessionType, setSessionType] = useState<"group" | "personal">("group");
  const [modality, setModality] = useState("");
  const [date, setDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("07:00");
  const [duration, setDuration] = useState("60");
  const [capacity, setCapacity] = useState("12");
  const [trainerId, setTrainerId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [notes, setNotes] = useState("");

  const createSession = useCreateSession();
  const updateSession = useUpdateSession();
  const updateFollowing = useUpdateThisAndFollowing();
  const updateAll = useUpdateAllOccurrences();
  const { data: modalities } = useActiveModalities();
  const { data: trainers } = useTrainers(true);
  const { data: students } = useStudents("", "active");
  const { data: services } = useServiceTypes();
  const { data: serviceRates } = useTrainerServiceRates();

  const isEditing = !!editSession;
  // Edição EM SÉRIE altera só horário, duração, modalidade e vagas — os
  // demais campos ficam desabilitados em vez de fingir que salvam.
  const isSeriesEdit =
    isEditing && (recurringAction === "this_and_following" || recurringAction === "all");

  const selectedTrainer = trainers?.find((t) => t.id === trainerId);

  // PR-C: o serviço PRECIFICA a sessão. As opções são os serviços cujo
  // formato bate com o tipo (turma → Grupo; individual → Personal,
  // Fisioterapia...). Com opção única o seletor nem aparece — escolha
  // sem alternativa é ruído.
  const serviceOptions = (services ?? []).filter(
    (s) => s.delivery_type === sessionType,
  );
  // Estado explícito manda (edição preserva o serviço HISTÓRICO da sessão,
  // mesmo se ele foi desativado no catálogo); auto-escolha só no vazio com
  // opção única.
  const effectiveServiceId =
    serviceTypeId || (serviceOptions.length === 1 ? serviceOptions[0].id : "");
  const selectedService = (services ?? []).find((s) => s.id === effectiveServiceId);

  // Tarifa do PAR treinador × serviço (trainer_service_rates).
  const pairRate =
    trainerId && effectiveServiceId
      ? serviceRates?.find(
          (r) => pairKey(r.trainer_id, r.service_type_id) === pairKey(trainerId, effectiveServiceId),
        )
      : undefined;

  useEffect(() => {
    if (editSession) {
      setSessionType(editSession.session_type);
      setModality(editSession.modality);
      setDate(editSession.session_date);
      setStartTime(editSession.start_time.slice(0, 5));
      setDuration(String(editSession.duration_minutes));
      setCapacity(String(editSession.capacity));
      setTrainerId(editSession.trainer_id || "");
      setStudentId(editSession.student_id || "");
      setServiceTypeId(editSession.service_type_id || "");
      setNotes(editSession.notes || "");
    } else {
      setSessionType("group");
      setModality("");
      setDate(defaultDate || new Date().toISOString().slice(0, 10));
      setStartTime("07:00");
      setDuration("60");
      setCapacity("12");
      setTrainerId("");
      setStudentId("");
      setServiceTypeId("");
      setNotes("");
    }
  }, [editSession, defaultDate, open]);

  // Auto-set capacity for personal; troca de tipo zera o serviço escolhido
  // (as opções mudam de conjunto).
  useEffect(() => {
    if (sessionType === "personal") setCapacity("1");
    if (!isEditing) setServiceTypeId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modality) return;

    const durationNum = parseInt(duration);
    const action = isEditing ? recurringAction || "this" : null;

    // end_time acompanha horário+duração — sem isso, mover 07:00→09:00
    // deixava a sessão "09:00–08:00" (o create computava, o update não).
    const endMinutes =
      parseInt(startTime.slice(0, 2)) * 60 + parseInt(startTime.slice(3, 5)) + durationNum;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

    // Campos estruturais (sem dinheiro) — usados por todos os caminhos.
    const baseData = {
      session_type: sessionType,
      session_date: date,
      start_time: startTime,
      duration_minutes: durationNum,
      modality,
      capacity: parseInt(capacity),
      trainer_id: trainerId || null,
      student_id: sessionType === "personal" ? (studentId || null) : null,
      notes: notes || null,
    };

    // O snapshot financeiro SÓ é recalculado quando este submit realmente
    // escreve dinheiro: criação, ou edição "this" não-paga com mudança em
    // treinador/serviço/duração. Fora disso, valores congelados ficam
    // congelados (sessão paga é registro de folha; edição de horário de
    // uma sessão antiga não pode ser refém de tarifa não cadastrada).
    const buildFinancials = () => {
      if (!effectiveServiceId) {
        toast.error("Escolha o serviço da sessão.");
        return null;
      }
      if (trainerId && !pairRate) {
        toast.error(
          `${selectedTrainer?.full_name ?? "Treinador"} não tem tarifa cadastrada para ${selectedService?.name ?? "este serviço"}. Cadastre em Treinadores → Pagamentos à equipe.`,
        );
        return null;
      }
      const snapshot = sessionPaymentSnapshot(durationNum, pairRate ?? null);
      return {
        service_type_id: effectiveServiceId,
        trainer_hourly_rate_cents: snapshot.trainer_hourly_rate_cents,
        payment_hours: snapshot.payment_hours,
        payment_amount_cents: snapshot.payment_amount_cents,
        payment_rate_basis: snapshot.payment_rate_basis,
      };
    };

    if (!isEditing) {
      const financials = buildFinancials();
      if (!financials) return;
      createSession.mutate(
        { ...baseData, ...financials },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }

    {
      if (action === "this") {
        const isPaid = !!editSession!.is_paid;
        const financialsChanged =
          (trainerId || null) !== (editSession!.trainer_id || null) ||
          (effectiveServiceId || null) !== (editSession!.service_type_id || null) ||
          durationNum !== editSession!.duration_minutes;

        let payload: Record<string, unknown> = {
          ...baseData,
          end_time: endTime,
          is_exception: !!editSession!.template_id,
        };
        if (isPaid) {
          // Dinheiro congelado: nem treinador/duração alteram o pago.
          if (financialsChanged) {
            toast.error(
              "Sessão já paga: horário e observações podem mudar, mas treinador, serviço e duração ficam congelados (ajuste tem fluxo próprio).",
            );
            return;
          }
        } else if (financialsChanged) {
          const financials = buildFinancials();
          if (!financials) return;
          payload = { ...payload, ...financials };
        }
        updateSession.mutate(
          { id: editSession!.id, ...payload },
          { onSuccess: () => onOpenChange(false) }
        );
      } else if (action === "this_and_following" && editSession!.template_id) {
        updateFollowing.mutate(
          { session: editSession!, updates: { start_time: startTime, duration_minutes: durationNum, modality, capacity: parseInt(capacity) } },
          { onSuccess: () => onOpenChange(false) }
        );
      } else if (action === "all" && editSession!.template_id) {
        updateAll.mutate(
          { templateId: editSession!.template_id, updates: { start_time: startTime, duration_minutes: durationNum, modality, capacity: parseInt(capacity) } },
          { onSuccess: () => onOpenChange(false) }
        );
      }
    }
  };

  const isPending = createSession.isPending || updateSession.isPending || updateFollowing.isPending || updateAll.isPending;

  const getTitle = () => {
    if (!isEditing) return "Nova Sessão";
    if (recurringAction === "this_and_following") return "Editar este e os seguintes";
    if (recurringAction === "all") return "Editar todos os eventos";
    return "Editar Sessão";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSeriesEdit && (
            <p className="text-xs text-muted-foreground rounded-md border px-3 py-2">
              Edição em série altera horário, duração, modalidade e vagas das
              próximas ocorrências. Treinador, aluno e observações são por
              sessão individual.
            </p>
          )}

          {/* Type selector */}
          {!isEditing && (
            <div className="flex gap-2">
              <Button type="button" variant={sessionType === "group" ? "default" : "outline"} size="sm" className="flex-1"
                onClick={() => setSessionType("group")}>Grupo</Button>
              <Button type="button" variant={sessionType === "personal" ? "default" : "outline"} size="sm" className="flex-1"
                onClick={() => setSessionType("personal")}>Personal</Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Modalidade</Label>
              <Select value={modality} onValueChange={setModality}>
                <SelectTrigger aria-label="Modalidade"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {modalities?.map((m) => (
                    <SelectItem key={m.id} value={m.slug}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
                disabled={recurringAction === "this_and_following" || recurringAction === "all"} />
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
              <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} min={1} max={50} required
                disabled={sessionType === "personal"} />
            </div>
          </div>
          {/* Serviço: aparece só quando há escolha real (>1 opção) */}
          {serviceOptions.length > 1 && (
            <div>
              <Label>Serviço</Label>
              <Select value={serviceTypeId} onValueChange={setServiceTypeId} disabled={isSeriesEdit}>
                <SelectTrigger aria-label="Serviço"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {serviceOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Treinador</Label>
            <Select value={trainerId} onValueChange={setTrainerId} disabled={isSeriesEdit}>
              <SelectTrigger aria-label="Treinador"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {trainers?.map((t) => {
                  const r = effectiveServiceId
                    ? serviceRates?.find(
                        (x) => x.trainer_id === t.id && x.service_type_id === effectiveServiceId,
                      )
                    : undefined;
                  return (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name}
                      {r && (
                        <span className="text-muted-foreground ml-1">
                          (R${(r.rate_cents / 100).toFixed(0)}
                          {r.rate_basis === "hourly" ? "/h" : "/sessão"})
                        </span>
                      )}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedTrainer && pairRate && parseInt(duration) > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Pagamento da sessão: R${" "}
                {(
                  sessionPaymentSnapshot(parseInt(duration), pairRate)
                    .payment_amount_cents / 100
                ).toFixed(2)}
              </p>
            )}
            {selectedTrainer && !pairRate && (
              <p className="text-[10px] text-destructive mt-1">
                Sem tarifa cadastrada para {selectedService?.name ?? "o serviço"} —
                cadastre em Treinadores → Pagamentos à equipe.
              </p>
            )}
          </div>

          {/* Student (personal only) */}
          {sessionType === "personal" && (
            <div>
              <Label>Aluno</Label>
              <Select value={studentId} onValueChange={setStudentId} disabled={isSeriesEdit}>
                <SelectTrigger aria-label="Aluno"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {students?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={isSeriesEdit} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending || !modality}>
              {isPending ? "Salvando..." : isEditing ? "Salvar" : "Criar Sessão"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
