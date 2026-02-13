import { useMemo, useEffect, useRef } from "react";
import { format, addDays, isToday } from "date-fns";
import { Session } from "@/hooks/useSchedule";
import { SessionCard } from "./SessionCard";

interface Props {
  sessions: Session[];
  weekStart: Date;
  modalityFilter: string[];
}

const HOUR_HEIGHT = 48;
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
        .filter((s) => modalityFilter.length === 0 || modalityFilter.includes(s.modality))
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
      return { date, dateStr, daySessions, dayIndex: i };
    });
  }, [sessions, weekStart, modalityFilter]);

  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const h = now.getHours();
      scrollRef.current.scrollTop = Math.max(0, (Math.max(START_HOUR, h - 1) - START_HOUR) * HOUR_HEIGHT);
    }
  }, []);

  const totalHeight = HOURS.length * HOUR_HEIGHT;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="grid border-b" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
        <div className="border-r" />
        {days.map(({ date, dateStr, dayIndex }) => {
          const today = isToday(date);
          return (
            <div key={dateStr} className="text-center py-2 border-r last:border-r-0">
              <p className={`text-[11px] uppercase font-medium ${today ? "text-primary" : "text-muted-foreground"}`}>
                {DAY_LABELS[dayIndex]}
              </p>
              <div className="flex justify-center mt-0.5">
                <span className={`text-base font-display font-bold leading-none flex items-center justify-center ${
                  today
                    ? "text-primary-foreground bg-primary rounded-full w-8 h-8"
                    : "text-foreground w-8 h-8"
                }`}>
                  {format(date, "dd")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid body */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
        <div className="relative" style={{ height: totalHeight }}>
          {/* Hour lines — full width across gutter + columns */}
          {HOURS.map((hour) => (
            <div
              key={`line-${hour}`}
              className="absolute left-0 right-0 border-t border-border/40"
              style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
            />
          ))}

          <div className="grid h-full" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
            {/* Time gutter */}
            <div className="relative border-r">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute right-3 text-[11px] text-muted-foreground font-medium -translate-y-1/2"
                  style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                >
                  {`${String(hour).padStart(2, "0")}:00`}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map(({ date, dateStr, daySessions }) => {
              const today = isToday(date);
              return (
                <div key={dateStr} className={`relative border-r last:border-r-0 ${today ? "bg-primary/[0.02]" : ""}`}>
                  {daySessions.map((session) => {
                    const top = getTimePosition(session.start_time);
                    const height = Math.max(getEventHeight(session.duration_minutes), 22);
                    return (
                      <div key={session.id} className="absolute left-0.5 right-0.5 z-10" style={{ top, height }}>
                        <SessionCard session={session} compact />
                      </div>
                    );
                  })}
                  {today && <CurrentTimeLine />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
