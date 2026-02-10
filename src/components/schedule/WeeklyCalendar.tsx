import { useMemo } from "react";
import { format, addDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClassSession, ClassModality } from "@/hooks/useSchedule";
import { SessionCard } from "./SessionCard";

interface Props {
  sessions: ClassSession[];
  weekStart: Date;
  modalityFilter: ClassModality | "all";
}

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function WeeklyCalendar({ sessions, weekStart, modalityFilter }: Props) {
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const dateStr = format(date, "yyyy-MM-dd");
      const daySessions = sessions
        .filter((s) => s.session_date === dateStr)
        .filter((s) => modalityFilter === "all" || s.modality === modalityFilter);
      return { date, dateStr, daySessions, dayIndex: i };
    });
  }, [sessions, weekStart, modalityFilter]);

  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="grid grid-cols-7 gap-1.5 min-h-[400px]">
      {days.map(({ date, dateStr, daySessions, dayIndex }) => (
        <div
          key={dateStr}
          className={`rounded-lg border p-2 flex flex-col gap-1.5 transition-colors ${
            dateStr === today ? "bg-primary/5 border-primary/30" : "bg-card"
          }`}
        >
          <div className="text-center mb-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {DAY_LABELS[dayIndex]}
            </p>
            <p className={`text-sm font-bold ${dateStr === today ? "text-primary" : ""}`}>
              {format(date, "dd")}
            </p>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[500px]">
            {daySessions.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/50 text-center mt-4">—</p>
            ) : (
              daySessions.map((s) => <SessionCard key={s.id} session={s} compact />)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
