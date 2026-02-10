import { Users, Clock, User, ChevronDown, ChevronUp, Plus, X, UserCheck, UserX } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClassSession,
  MODALITY_LABELS,
  MODALITY_COLORS,
  useCreateBooking,
  useUpdateBookingStatus,
  BookingStatus,
} from "@/hooks/useSchedule";
import { useStudents, Student } from "@/hooks/useStudents";
import { cn } from "@/lib/utils";

interface SessionCardProps {
  session: ClassSession;
  compact?: boolean;
}

export function SessionCard({ session, compact }: SessionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");

  const confirmedBookings = session.bookings?.filter((b) => b.status === "confirmed") ?? [];
  const waitlistBookings = session.bookings?.filter((b) => b.status === "waitlist") ?? [];
  const spotsLeft = session.capacity - confirmedBookings.length;
  const isFull = spotsLeft <= 0;

  const { data: students } = useStudents("", "active");
  const createBooking = useCreateBooking();
  const updateBookingStatus = useUpdateBookingStatus();

  const bookedStudentIds = new Set(
    session.bookings?.filter((b) => b.status !== "cancelled").map((b) => b.student_id)
  );
  const availableStudents = students?.filter((s) => !bookedStudentIds.has(s.id)) ?? [];

  const handleAddStudent = () => {
    if (!selectedStudentId) return;
    const status: BookingStatus = isFull ? "waitlist" : "confirmed";
    createBooking.mutate(
      { session_id: session.id, student_id: selectedStudentId, status },
      {
        onSuccess: () => {
          setSelectedStudentId("");
          setAddingStudent(false);
        },
      }
    );
  };

  const time = session.start_time.slice(0, 5);
  const endMinutes =
    parseInt(session.start_time.slice(0, 2)) * 60 +
    parseInt(session.start_time.slice(3, 5)) +
    session.duration_minutes;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        session.status === "cancelled" && "opacity-50",
        MODALITY_COLORS[session.modality]
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{MODALITY_LABELS[session.modality]}</span>
            <span className="text-xs opacity-70 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {time}–{endTime}
            </span>
          </div>
          {session.instructor && (
            <p className="text-xs opacity-70 mt-0.5 flex items-center gap-1">
              <User className="h-3 w-3" /> {session.instructor.full_name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant={isFull ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
            <Users className="h-3 w-3 mr-0.5" />
            {confirmedBookings.length}/{session.capacity}
          </Badge>
          {!compact && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {expanded && !compact && (
        <div className="mt-3 space-y-2 border-t pt-2 border-current/10">
          {confirmedBookings.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 opacity-60">Confirmados</p>
              <div className="space-y-1">
                {confirmedBookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1">
                      <UserCheck className="h-3 w-3" /> {b.student?.full_name ?? "—"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-50 hover:opacity-100"
                      onClick={() => updateBookingStatus.mutate({ id: b.id, status: "cancelled" })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {waitlistBookings.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 opacity-60">Lista de Espera</p>
              <div className="space-y-1">
                {waitlistBookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1">
                      <UserX className="h-3 w-3" /> {b.student?.full_name ?? "—"}
                    </span>
                    <div className="flex gap-0.5">
                      {!isFull && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => updateBookingStatus.mutate({ id: b.id, status: "confirmed" })}
                          title="Confirmar"
                        >
                          <UserCheck className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-50 hover:opacity-100"
                        onClick={() => updateBookingStatus.mutate({ id: b.id, status: "cancelled" })}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {addingStudent ? (
            <div className="flex items-center gap-1.5">
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue placeholder="Selecione aluno" />
                </SelectTrigger>
                <SelectContent>
                  {availableStudents.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.full_name}
                    </SelectItem>
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
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => setAddingStudent(true)}>
              <Plus className="h-3 w-3 mr-1" /> Agendar Aluno
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
