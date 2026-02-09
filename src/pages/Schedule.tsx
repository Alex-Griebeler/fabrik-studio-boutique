import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

export default function Schedule() {
  return (
    <div>
      <PageHeader title="Agenda" description="Grade horária e aulas" />
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <CalendarDays className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm font-medium">Módulo de agenda</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Grade horária, aulas e check-in</p>
      </div>
    </div>
  );
}
