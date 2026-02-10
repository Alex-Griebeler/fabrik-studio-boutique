import { useMemo, useEffect, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClassSession } from "@/hooks/useSchedule";
import { SessionCard } from "./SessionCard";

interface Props {
  sessions: ClassSession[];
  selectedDate: Date;
  modalityFilter: string;
}

const HOUR_HEIGHT = 64;
const START_HOUR = 6;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

function getTimePosition(timeStr: string): number {
  const h = parseInt(timeStr.slice(0, 2));
  const m = parseInt(timeStr.slice(3, 5));
  return (h - START_HOUR + m / 60) * HOUR_HEIGHT;
}

function getEventHeight(durationMinutes: number): number {
  return (durationMinutes / 60) * HOUR_HEIGHT;
}

export function DailyList({ sessions, selectedDate, modalityFilter }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const filtered = useMemo(() =>
    sessions
      .filter((s) => s.session_date === dateStr)
      .filter((s) => modalityFilter === "all" || s.modality === modalityFilter)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [sessions, dateStr, modalityFilter]
  );

  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const h = now.getHours();
      scrollRef.current.scrollTop = Math.max(0, (Math.max(START_HOUR, h - 1) - START_HOUR) * HOUR_HEIGHT);
    }
  }, []);

  const totalHeight = HOURS.length * HOUR_HEIGHT;

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground/60">
          Nenhuma aula em {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="p-3 border-b">
        <p className="text-sm font-display font-semibold capitalize">
          {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            ({filtered.length} aula{filtered.length !== 1 ? "s" : ""})
          </span>
        </p>
      </div>

      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
        <div className="grid relative" style={{ gridTemplateColumns: "56px 1fr", height: totalHeight }}>
          {/* Time labels */}
          <div className="relative border-r">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute right-3 text-[10px] text-muted-foreground font-medium -translate-y-1/2"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
              >
                {`${String(hour).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {/* Events column */}
          <div className="relative">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-border/50"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
              />
            ))}
            {HOURS.map((hour) => (
              <div
                key={`${hour}-half`}
                className="absolute left-0 right-0 border-t border-border/20 border-dashed"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
              />
            ))}

            {filtered.map((session) => {
              const top = getTimePosition(session.start_time);
              const height = Math.max(getEventHeight(session.duration_minutes), 32);
              return (
                <div
                  key={session.id}
                  className="absolute left-1 z-10"
                  style={{ top, height, width: "min(100% - 8px, 480px)" }}
                >
                  <SessionCard session={session} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
