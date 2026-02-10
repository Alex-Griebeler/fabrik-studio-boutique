import { Users, Clock, User, CheckCircle2 } from "lucide-react";
import {
  ClassSession,
  useModalities,
  getModalityColor,
} from "@/hooks/useSchedule";
import { cn } from "@/lib/utils";
import { SessionDetailPopover } from "./SessionDetailPopover";

interface SessionCardProps {
  session: ClassSession;
  compact?: boolean;
}

export function SessionCard({ session, compact }: SessionCardProps) {
  const { data: modalities } = useModalities();
  const mod = modalities?.find((m) => m.slug === session.modality);

  const confirmedBookings = session.bookings?.filter((b) => b.status === "confirmed" || b.status === "no_show") ?? [];
  const noShowCount = session.bookings?.filter((b) => b.status === "no_show").length ?? 0;
  const presentCount = confirmedBookings.length - noShowCount;
  const isFull = confirmedBookings.length >= session.capacity;

  const time = session.start_time.slice(0, 5);
  const endMinutes =
    parseInt(session.start_time.slice(0, 2)) * 60 +
    parseInt(session.start_time.slice(3, 5)) +
    session.duration_minutes;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

  const colorClass = mod ? getModalityColor(mod.color) : getModalityColor("primary");

  // Compact chip for weekly grid
  if (compact) {
    return (
      <SessionDetailPopover session={session}>
        <button
          className={cn(
            "w-full text-left rounded-md px-1.5 py-0.5 text-[11px] leading-tight font-medium border-l-[3px] transition-all",
            "hover:shadow-md hover:brightness-95 cursor-pointer",
            session.status === "cancelled" && "opacity-40 line-through",
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
    <SessionDetailPopover session={session}>
      <button
        className={cn(
          "w-full text-left rounded-lg border-l-4 p-3 transition-all bg-card hover:shadow-md cursor-pointer border",
          session.status === "cancelled" && "opacity-40",
          colorClass
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-sm">{mod?.name ?? session.modality}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3" />
              {time} – {endTime}
              <span className="opacity-40 mx-0.5">·</span>
              {session.duration_minutes}min
            </p>
            {session.instructor && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <User className="h-3 w-3" /> {session.instructor.full_name}
              </p>
            )}
          </div>
          <div className={cn(
            "flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5",
            isFull ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          )}>
            <Users className="h-3 w-3" />
            {confirmedBookings.length}/{session.capacity}
          </div>
        </div>
      </button>
    </SessionDetailPopover>
  );
}
