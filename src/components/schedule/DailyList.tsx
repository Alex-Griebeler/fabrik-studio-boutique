import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClassSession } from "@/hooks/useSchedule";
import { SessionCard } from "./SessionCard";

interface Props {
  sessions: ClassSession[];
  selectedDate: Date;
  modalityFilter: string;
}

export function DailyList({ sessions, selectedDate, modalityFilter }: Props) {
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const filtered = sessions
    .filter((s) => s.session_date === dateStr)
    .filter((s) => modalityFilter === "all" || s.modality === modalityFilter);

  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground mb-3">
        {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        <span className="ml-2 text-xs">({filtered.length} aula{filtered.length !== 1 ? "s" : ""})</span>
      </p>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground/60 text-center py-12">Nenhuma aula neste dia</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}
