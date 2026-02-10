import { useState } from "react";
import { Users, Clock, User, Plus, X, UserCheck, UserX, Trash2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  ClassSession,
  useModalities,
  getModalityColor,
  useCreateBooking,
  useUpdateBookingStatus,
  useDeleteSession,
  useCancelSingleOccurrence,
  useDeleteThisAndFollowing,
  useDeleteAllOccurrences,
  BookingStatus,
} from "@/hooks/useSchedule";
import { useStudents } from "@/hooks/useStudents";
import { SessionFormDialog } from "./SessionFormDialog";
import { RecurringActionDialog, RecurringAction } from "./RecurringActionDialog";

interface SessionDetailPopoverProps {
  session: ClassSession;
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
  const [pendingEditAction, setPendingEditAction] = useState<RecurringAction | null>(null);

  const { data: modalities } = useModalities();
  const mod = modalities?.find((m) => m.slug === session.modality);

  const confirmedBookings = session.bookings?.filter((b) => b.status === "confirmed") ?? [];
  const waitlistBookings = session.bookings?.filter((b) => b.status === "waitlist") ?? [];
  const spotsLeft = session.capacity - confirmedBookings.length;
  const isFull = spotsLeft <= 0;

  const { data: students } = useStudents("", "active");
  const createBooking = useCreateBooking();
  const updateBookingStatus = useUpdateBookingStatus();
  const deleteSession = useDeleteSession();
  const cancelSingle = useCancelSingleOccurrence();
  const deleteFollowing = useDeleteThisAndFollowing();
  const deleteAll = useDeleteAllOccurrences();

  const isRecurring = !!session.template_id;

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
  const endMinutes =
    parseInt(session.start_time.slice(0, 2)) * 60 +
    parseInt(session.start_time.slice(3, 5)) +
    session.duration_minutes;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start" side="right" sideOffset={4}>
          {/* Header */}
          <div className="flex items-center justify-between p-3 pb-2 border-b">
            <div>
              <h4 className="font-display font-semibold text-sm">{mod?.name ?? session.modality}</h4>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3" /> {time} – {endTime}
                <span className="text-muted-foreground/50 mx-1">·</span>
                {session.duration_minutes}min
              </p>
            </div>
            <div className="flex items-center gap-0.5">
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
            {session.instructor && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span>{session.instructor.full_name}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs">
              <Badge variant={isFull ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
                <Users className="h-3 w-3 mr-0.5" />
                {confirmedBookings.length}/{session.capacity}
              </Badge>
              {spotsLeft > 0 && (
                <span className="text-muted-foreground">{spotsLeft} vaga{spotsLeft !== 1 ? "s" : ""}</span>
              )}
            </div>

            {/* Confirmed */}
            {confirmedBookings.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 text-muted-foreground">Confirmados</p>
                <div className="space-y-1">
                  {confirmedBookings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="h-3 w-3 text-success" /> {b.student?.full_name ?? "—"}
                      </span>
                      <Button variant="ghost" size="icon" className="h-5 w-5 opacity-40 hover:opacity-100"
                        onClick={() => updateBookingStatus.mutate({ id: b.id, status: "cancelled" })}>
                        <X className="h-3 w-3" />
                      </Button>
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

            {/* Add student */}
            {addingStudent ? (
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
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Dialogs */}
      <SessionFormDialog
        open={showEdit}
        onOpenChange={(v) => { setShowEdit(v); if (!v) setPendingEditAction(null); }}
        editSession={session}
        recurringAction={pendingEditAction}
      />
      <RecurringActionDialog
        open={showRecurringEdit}
        onOpenChange={setShowRecurringEdit}
        title="Editar evento recorrente"
        description="Este evento faz parte de uma série recorrente."
        onSelect={handleRecurringEdit}
        variant="edit"
      />
      <RecurringActionDialog
        open={showRecurringDelete}
        onOpenChange={setShowRecurringDelete}
        title="Excluir evento recorrente"
        description="Este evento faz parte de uma série recorrente."
        onSelect={handleRecurringDelete}
        variant="delete"
        isPending={cancelSingle.isPending || deleteFollowing.isPending || deleteAll.isPending}
      />
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aula?</AlertDialogTitle>
            <AlertDialogDescription>
              A aula de {mod?.name ?? session.modality} às {time} será removida permanentemente.
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
