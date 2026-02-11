import { useState } from "react";
import { Users, Clock, User, Plus, X, UserCheck, UserX, Trash2, Pencil, CheckCircle2, XCircle, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  Session,
  useModalities,
  getModalityColor,
  useCreateBooking,
  useUpdateBookingStatus,
  useDeleteSession,
  useCancelSingleOccurrence,
  useDeleteThisAndFollowing,
  useDeleteAllOccurrences,
  useTrainerCheckin,
  useStudentCheckin,
  useCompleteSession,
  BookingStatus,
} from "@/hooks/useSchedule";
import { useStudents } from "@/hooks/useStudents";
import { SessionFormDialog } from "./SessionFormDialog";
import { RecurringActionDialog, RecurringAction } from "./RecurringActionDialog";
import { SessionStatusBadge } from "./SessionStatusBadge";
import { CheckInButton } from "./CheckInButton";
import { CancelSessionDialog } from "./CancelSessionDialog";

interface SessionDetailPopoverProps {
  session: Session;
  children: React.ReactNode;
}

export function SessionDetailPopover({ session, children }: SessionDetailPopoverProps) {
  const [open, setOpen] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRecurringDelete, setShowRecurringDelete] = useState(false);
  const [showRecurringEdit, setShowRecurringEdit] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [pendingEditAction, setPendingEditAction] = useState<RecurringAction | null>(null);

  const { data: modalities } = useModalities();
  const mod = modalities?.find((m) => m.slug === session.modality);

  const confirmedBookings = session.bookings?.filter((b) => b.status === "confirmed" || b.status === "no_show") ?? [];
  const waitlistBookings = session.bookings?.filter((b) => b.status === "waitlist") ?? [];
  const spotsLeft = session.capacity - confirmedBookings.length;
  const isFull = spotsLeft <= 0;

  const sessionDateTime = new Date(`${session.session_date}T${session.start_time}`);
  const isPast = sessionDateTime <= new Date();
  const isActive = session.status === "scheduled";

  const { data: students } = useStudents("", "active");
  const createBooking = useCreateBooking();
  const updateBookingStatus = useUpdateBookingStatus();
  const deleteSession = useDeleteSession();
  const cancelSingle = useCancelSingleOccurrence();
  const deleteFollowing = useDeleteThisAndFollowing();
  const deleteAll = useDeleteAllOccurrences();
  const trainerCheckin = useTrainerCheckin();
  const studentCheckin = useStudentCheckin();
  const completeSession = useCompleteSession();

  const isRecurring = !!session.template_id;
  const isGroup = session.session_type === "group";

  const bookedStudentIds = new Set(
    session.bookings?.filter((b) => b.status !== "cancelled").map((b) => b.student_id)
  );
  const availableStudents = students?.filter((s) => !bookedStudentIds.has(s.id)) ?? [];

  const handleAddStudent = () => {
    if (!selectedStudentId) return;
    const status: BookingStatus = isFull ? "waitlist" : "confirmed";
    createBooking.mutate(
      { session_id: session.id, student_id: selectedStudentId, status },
      { onSuccess: () => { setSelectedStudentId(""); setAddingStudent(false); } }
    );
  };

  const handleDeleteClick = () => {
    setOpen(false);
    if (isRecurring) {
      setShowRecurringDelete(true);
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const handleCancelClick = () => {
    setOpen(false);
    setShowCancelDialog(true);
  };

  const handleRecurringDelete = (action: RecurringAction) => {
    setShowRecurringDelete(false);
    if (action === "this") cancelSingle.mutate(session.id);
    else if (action === "this_and_following") deleteFollowing.mutate({ session });
    else if (action === "all" && session.template_id) deleteAll.mutate(session.template_id);
  };

  const handleEditClick = () => {
    setOpen(false);
    if (isRecurring) {
      setShowRecurringEdit(true);
    } else {
      setShowEdit(true);
    }
  };

  const handleRecurringEdit = (action: RecurringAction) => {
    setShowRecurringEdit(false);
    setPendingEditAction(action);
    setShowEdit(true);
  };

  const time = session.start_time.slice(0, 5);
  const endTime = session.end_time.slice(0, 5);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start" side="right" sideOffset={4}>
          <TooltipProvider>
            {/* Header */}
            <div className="flex items-center justify-between p-3 pb-2 border-b">
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="font-display font-semibold text-sm">{mod?.name ?? session.modality}</h4>
                  {!isGroup && <span className="text-[9px] bg-primary/10 text-primary px-1 rounded">Personal</span>}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" /> {time} – {endTime}
                  <span className="text-muted-foreground/50 mx-1">·</span>
                  {session.duration_minutes}min
                </p>
                {session.status !== "scheduled" && (
                  <SessionStatusBadge status={session.status} size="sm" className="mt-1" />
                )}
              </div>
              <div className="flex items-center gap-0.5">
                {isActive && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-warning" onClick={handleCancelClick} title="Cancelar sessão">
                    <Ban className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleEditClick}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleDeleteClick}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Details */}
            <div className="p-3 space-y-3">
              {/* Trainer with check-in */}
              {session.trainer && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  <span className="flex-1">{session.trainer.full_name}</span>
                  {isActive && isPast && !session.trainer_checkin_at ? (
                    <CheckInButton
                      type="trainer"
                      checkinAt={null}
                      onCheckin={() => trainerCheckin.mutate(session.id)}
                      isPending={trainerCheckin.isPending}
                      compact
                    />
                  ) : (
                    session.trainer_checkin_at && (
                      <CheckInButton type="trainer" checkinAt={session.trainer_checkin_at} onCheckin={() => {}} compact />
                    )
                  )}
                </div>
              )}

              {/* Student with check-in (personal) */}
              {session.student && session.session_type === "personal" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  <span className="flex-1">{session.student.full_name}</span>
                  {isActive && isPast && !session.student_checkin_at ? (
                    <CheckInButton
                      type="student"
                      checkinAt={null}
                      onCheckin={() => studentCheckin.mutate(session.id)}
                      isPending={studentCheckin.isPending}
                      compact
                    />
                  ) : (
                    session.student_checkin_at && (
                      <CheckInButton type="student" checkinAt={session.student_checkin_at} onCheckin={() => {}} compact />
                    )
                  )}
                </div>
              )}

              {/* Complete button */}
              {isActive && isPast && session.trainer_checkin_at && (
                <Button variant="default" size="sm" className="w-full h-7 text-xs"
                  onClick={() => completeSession.mutate(session.id)} disabled={completeSession.isPending}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Concluir Sessão
                </Button>
              )}

              {/* Group capacity */}
              {isGroup && (
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant={isFull ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
                    <Users className="h-3 w-3 mr-0.5" />
                    {confirmedBookings.length}/{session.capacity}
                  </Badge>
                  {spotsLeft > 0 && (
                    <span className="text-muted-foreground">{spotsLeft} vaga{spotsLeft !== 1 ? "s" : ""}</span>
                  )}
                </div>
              )}

              {/* Financial info (personal sessions) */}
              {session.session_type === "personal" && session.payment_amount_cents > 0 && (
                <div className="text-[10px] text-muted-foreground bg-muted/50 rounded px-2 py-1">
                  Taxa: R$ {(session.payment_amount_cents / 100).toFixed(2)}
                  {session.is_paid && <span className="text-success ml-1">· Pago</span>}
                </div>
              )}

              {/* Cancellation reason */}
              {session.cancellation_reason && (
                <div className="text-[10px] text-muted-foreground bg-muted/50 rounded px-2 py-1">
                  <span className="font-medium">Motivo:</span> {session.cancellation_reason}
                </div>
              )}

              {/* Confirmed bookings (group) */}
              {isGroup && confirmedBookings.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 text-muted-foreground">
                    {isPast ? "Presença" : "Confirmados"}
                  </p>
                  <div className="space-y-1">
                    {confirmedBookings.map((b) => (
                      <div key={b.id} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          {b.status === "no_show" ? (
                            <XCircle className="h-3 w-3 text-destructive" />
                          ) : (
                            <UserCheck className="h-3 w-3 text-success" />
                          )}
                          <span className={b.status === "no_show" ? "line-through text-muted-foreground" : ""}>
                            {b.student?.full_name ?? "—"}
                          </span>
                        </span>
                        <div className="flex gap-0.5">
                          {isPast && b.status === "confirmed" && (
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive/60 hover:text-destructive" title="Marcar falta"
                              onClick={() => updateBookingStatus.mutate({ id: b.id, status: "no_show" })}>
                              <XCircle className="h-3 w-3" />
                            </Button>
                          )}
                          {isPast && b.status === "no_show" && (
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-success/60 hover:text-success" title="Reverter"
                              onClick={() => updateBookingStatus.mutate({ id: b.id, status: "confirmed" })}>
                              <CheckCircle2 className="h-3 w-3" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-5 w-5 opacity-40 hover:opacity-100"
                            onClick={() => updateBookingStatus.mutate({ id: b.id, status: "cancelled" })}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Waitlist */}
              {waitlistBookings.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 text-muted-foreground">Lista de Espera</p>
                  <div className="space-y-1">
                    {waitlistBookings.map((b) => (
                      <div key={b.id} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <UserX className="h-3 w-3 text-warning" /> {b.student?.full_name ?? "—"}
                        </span>
                        <div className="flex gap-0.5">
                          {!isFull && (
                            <Button variant="ghost" size="icon" className="h-5 w-5"
                              onClick={() => updateBookingStatus.mutate({ id: b.id, status: "confirmed" })}>
                              <UserCheck className="h-3 w-3" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-5 w-5 opacity-40 hover:opacity-100"
                            onClick={() => updateBookingStatus.mutate({ id: b.id, status: "cancelled" })}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add student (group) */}
              {isGroup && isActive && (
                addingStudent ? (
                  <div className="flex items-center gap-1.5">
                    <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                      <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Selecione aluno" /></SelectTrigger>
                      <SelectContent>
                        {availableStudents.map((s) => (
                          <SelectItem key={s.id} value={s.id} className="text-xs">{s.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-7 text-xs px-2" onClick={handleAddStudent} disabled={!selectedStudentId || createBooking.isPending}>
                      {isFull ? "Espera" : "Add"}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAddingStudent(false)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => setAddingStudent(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Agendar Aluno
                  </Button>
                )
              )}
            </div>
          </TooltipProvider>
        </PopoverContent>
      </Popover>

      {/* Dialogs */}
      <CancelSessionDialog
        session={session}
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
      />
      <SessionFormDialog
        open={showEdit}
        onOpenChange={(v) => { setShowEdit(v); if (!v) setPendingEditAction(null); }}
        editSession={session}
        recurringAction={pendingEditAction}
      />
      <RecurringActionDialog open={showRecurringEdit} onOpenChange={setShowRecurringEdit}
        title="Editar evento recorrente" description="Este evento faz parte de uma série recorrente."
        onSelect={handleRecurringEdit} variant="edit" />
      <RecurringActionDialog open={showRecurringDelete} onOpenChange={setShowRecurringDelete}
        title="Excluir evento recorrente" description="Este evento faz parte de uma série recorrente."
        onSelect={handleRecurringDelete} variant="delete"
        isPending={cancelSingle.isPending || deleteFollowing.isPending || deleteAll.isPending} />
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              A sessão de {mod?.name ?? session.modality} às {time} será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteSession.mutate(session.id)} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
