import { useMemo, useEffect, useRef } from "react";
import { format, addDays, isToday } from "date-fns";
import { ClassSession } from "@/hooks/useSchedule";
import { SessionCard } from "./SessionCard";

interface Props {
  sessions: ClassSession[];
  weekStart: Date;
  modalityFilter: string;
}

const HOUR_HEIGHT = 56; // px per hour
const START_HOUR = 6;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const DAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function getTimePosition(timeStr: string): number {
  const h = parseInt(timeStr.slice(0, 2));
  const m = parseInt(timeStr.slice(3, 5));
  return (h - START_HOUR + m / 60) * HOUR_HEIGHT;
}

function getEventHeight(durationMinutes: number): number {
  return (durationMinutes / 60) * HOUR_HEIGHT;
}

function CurrentTimeLine() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  if (h < START_HOUR || h >= END_HOUR) return null;
  const top = (h - START_HOUR + m / 60) * HOUR_HEIGHT;

  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-2 h-2 rounded-full bg-destructive -ml-1 shrink-0" />
        <div className="flex-1 h-[1.5px] bg-destructive" />
      </div>
    </div>
  );
}

export function WeeklyCalendar({ sessions, weekStart, modalityFilter }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const dateStr = format(date, "yyyy-MM-dd");
      const daySessions = sessions
        .filter((s) => s.session_date === dateStr)
        .filter((s) => modalityFilter === "all" || s.modality === modalityFilter)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
      return { date, dateStr, daySessions, dayIndex: i };
    });
  }, [sessions, weekStart, modalityFilter]);

  // Scroll to ~current hour on mount
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const h = now.getHours();
      const targetHour = Math.max(START_HOUR, h - 1);
      scrollRef.current.scrollTop = (targetHour - START_HOUR) * HOUR_HEIGHT;
    }
  }, []);

  const totalHeight = HOURS.length * HOUR_HEIGHT;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Day headers */}
      <div className="grid border-b" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
        <div className="border-r" />
        {days.map(({ date, dateStr, dayIndex }) => {
          const today = isToday(date);
          return (
            <div
              key={dateStr}
              className={`text-center py-2 border-r last:border-r-0 ${today ? "bg-primary/5" : ""}`}
            >
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                {DAY_LABELS[dayIndex]}
              </p>
              <p className={`text-lg font-display font-bold leading-tight ${
                today ? "text-primary-foreground bg-primary rounded-full w-8 h-8 flex items-center justify-center mx-auto" : "text-foreground"
              }`}>
                {format(date, "dd")}
              </p>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
        <div className="grid relative" style={{ gridTemplateColumns: "48px repeat(7, 1fr)", height: totalHeight }}>
          {/* Time labels */}
          <div className="relative border-r">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 text-[10px] text-muted-foreground font-medium -translate-y-1/2"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
              >
                {`${String(hour).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map(({ date, dateStr, daySessions, dayIndex }) => {
            const today = isToday(date);
            return (
              <div key={dateStr} className={`relative border-r last:border-r-0 ${today ? "bg-primary/[0.02]" : ""}`}>
                {/* Hour gridlines */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-border/50"
                    style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                  />
                ))}
                {/* Half-hour gridlines */}
                {HOURS.map((hour) => (
                  <div
                    key={`${hour}-half`}
                    className="absolute left-0 right-0 border-t border-border/20 border-dashed"
                    style={{ top: (hour - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {/* Events */}
                {daySessions.map((session) => {
                  const top = getTimePosition(session.start_time);
                  const height = Math.max(getEventHeight(session.duration_minutes), 22);
                  return (
                    <div
                      key={session.id}
                      className="absolute left-0.5 right-0.5 z-10"
                      style={{ top, height }}
                    >
                      <SessionCard session={session} compact />
                    </div>
                  );
                })}

                {/* Current time line */}
                {today && <CurrentTimeLine />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
