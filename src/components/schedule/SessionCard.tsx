import { Users, Clock, User } from "lucide-react";
import {
  Session,
  useModalities,
  getModalityColor,
} from "@/hooks/useSchedule";
import { cn } from "@/lib/utils";
import { SessionDetailPopover } from "./SessionDetailPopover";
import { SessionStatusBadge } from "./SessionStatusBadge";
import { CheckInButton } from "./CheckInButton";
import { TooltipProvider } from "@/components/ui/tooltip";

interface SessionCardProps {
  session: Session;
  compact?: boolean;
}

export function SessionCard({ session, compact }: SessionCardProps) {
  const { data: modalities } = useModalities();
  const mod = modalities?.find((m) => m.slug === session.modality);

  const confirmedBookings = session.bookings?.filter((b) => b.status === "confirmed" || b.status === "no_show") ?? [];
  const isFull = confirmedBookings.length >= session.capacity;
  const isCancelled = session.status === "cancelled_on_time" || session.status === "cancelled_late";

  const time = session.start_time.slice(0, 5);
  const endTime = session.end_time.slice(0, 5);

  const colorClass = mod ? getModalityColor(mod.color) : getModalityColor("primary");

  // Compact chip for weekly grid
  if (compact) {
    return (
      <SessionDetailPopover session={session}>
        <button
          className={cn(
            "w-full text-left rounded-md px-1.5 py-0.5 text-[11px] leading-tight font-medium border-l-[3px] transition-all",
            "hover:shadow-md hover:brightness-95 cursor-pointer",
            isCancelled && "opacity-40 line-through",
            colorClass
          )}
        >
          <div className="truncate font-semibold">{mod?.name ?? session.modality}</div>
          <div className="truncate opacity-70 text-[10px]">{time}–{endTime}</div>
        </button>
      </SessionDetailPopover>
    );
  }

  // Full card for daily view
  return (
    <TooltipProvider>
      <SessionDetailPopover session={session}>
        <button
          className={cn(
            "w-full text-left rounded-lg border-l-4 p-3 transition-all bg-card hover:shadow-md cursor-pointer border",
            isCancelled && "opacity-40",
            colorClass
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-display font-semibold text-sm">{mod?.name ?? session.modality}</p>
                {session.session_type === "personal" && (
                  <span className="text-[9px] bg-primary/10 text-primary px-1 rounded">Personal</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3" />
                {time} – {endTime}
                <span className="opacity-40 mx-0.5">·</span>
                {session.duration_minutes}min
              </p>
              {session.trainer && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <User className="h-3 w-3" /> {session.trainer.full_name}
                </p>
              )}
              {session.student && session.session_type === "personal" && (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <User className="h-3 w-3" /> {session.student.full_name}
                </p>
              )}
              {/* Check-in indicators */}
              {(session.trainer_checkin_at || session.student_checkin_at) && (
                <div className="flex items-center gap-1.5 mt-1">
                  {session.trainer_checkin_at && (
                    <CheckInButton type="trainer" checkinAt={session.trainer_checkin_at} onCheckin={() => {}} compact />
                  )}
                  {session.student_checkin_at && (
                    <CheckInButton type="student" checkinAt={session.student_checkin_at} onCheckin={() => {}} compact />
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {session.session_type === "group" && (
                <div className={cn(
                  "flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5",
                  isFull ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                )}>
                  <Users className="h-3 w-3" />
                  {confirmedBookings.length}/{session.capacity}
                </div>
              )}
              {session.status !== "scheduled" && (
                <SessionStatusBadge status={session.status} size="sm" showIcon={false} />
              )}
            </div>
          </div>
        </button>
      </SessionDetailPopover>
    </TooltipProvider>
  );
}
