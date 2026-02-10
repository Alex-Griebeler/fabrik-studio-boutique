import { useState, useMemo } from "react";
import { format, addDays, subDays, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, List, LayoutGrid, Settings2, Wand2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
import { useClassSessions, useActiveModalities, useGenerateWeekSessions, useDeleteWeekSessions } from "@/hooks/useSchedule";
import { WeeklyCalendar } from "@/components/schedule/WeeklyCalendar";
import { DailyList } from "@/components/schedule/DailyList";
import { SessionFormDialog } from "@/components/schedule/SessionFormDialog";
import { ModalitiesManager } from "@/components/schedule/ModalitiesManager";
import { TemplateManager } from "@/components/schedule/TemplateManager";

export default function Schedule() {
  const [view, setView] = useState<"week" | "day">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modalityFilter, setModalityFilter] = useState("all");
  const [showNewSession, setShowNewSession] = useState(false);
  const [showDeleteWeek, setShowDeleteWeek] = useState(false);
  const generateWeek = useGenerateWeekSessions();
  const deleteWeek = useDeleteWeekSessions();

  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 0 }), [currentDate]);
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 0 }), [currentDate]);

  const { data: sessions, isLoading } = useClassSessions(
    format(weekStart, "yyyy-MM-dd"),
    format(weekEnd, "yyyy-MM-dd")
  );

  const { data: modalities } = useActiveModalities();

  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => setCurrentDate((d) => (view === "week" ? subDays(d, 7) : subDays(d, 1)));
  const goNext = () => setCurrentDate((d) => (view === "week" ? addDays(d, 7) : addDays(d, 1)));

  const headerLabel =
    view === "week"
      ? `${format(weekStart, "dd MMM", { locale: ptBR })} – ${format(weekEnd, "dd MMM yyyy", { locale: ptBR })}`
      : format(currentDate, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR });

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Grade horária e aulas"
        actions={
          <div className="flex gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button size="sm" variant="outline">
                  <Settings2 className="h-4 w-4 mr-1" /> Configurar
                </Button>
              </SheetTrigger>
              <SheetContent className="overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Configurações da Agenda</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-6">
                  <TemplateManager />
                  <div className="border-t pt-4">
                    <ModalitiesManager />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateWeek.mutate({ weekStart: format(weekStart, "yyyy-MM-dd") })}
              disabled={generateWeek.isPending}
            >
              <Wand2 className="h-4 w-4 mr-1" />
              {generateWeek.isPending ? "Gerando..." : "Gerar Semana"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDeleteWeek(true)}
              disabled={deleteWeek.isPending || !sessions?.length}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Limpar Semana
            </Button>
            <Button size="sm" onClick={() => setShowNewSession(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nova Aula
            </Button>
          </div>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={goToday}>Hoje</Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium capitalize ml-1">{headerLabel}</span>
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="flex items-center gap-1 flex-wrap">
            <Button
              variant={modalityFilter === "all" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setModalityFilter("all")}
            >
              Todas
            </Button>
            {modalities?.map((m) => (
              <Button
                key={m.id}
                variant={modalityFilter === m.slug ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setModalityFilter(m.slug)}
              >
                {m.name}
              </Button>
            ))}
          </div>

          <div className="flex border rounded-md">
            <Button
              variant={view === "week" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setView("week")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "day" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => setView("day")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <CalendarDays className="h-8 w-8 animate-pulse mr-2" />
          <span className="text-sm">Carregando agenda...</span>
        </div>
      ) : view === "week" ? (
        <WeeklyCalendar sessions={sessions ?? []} weekStart={weekStart} modalityFilter={modalityFilter} />
      ) : (
        <DailyList sessions={sessions ?? []} selectedDate={currentDate} modalityFilter={modalityFilter} />
      )}

      <SessionFormDialog
        open={showNewSession}
        onOpenChange={setShowNewSession}
        defaultDate={format(currentDate, "yyyy-MM-dd")}
      />

      {/* Delete Week Confirmation */}
      <AlertDialog open={showDeleteWeek} onOpenChange={setShowDeleteWeek}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar semana?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as {sessions?.length ?? 0} aula(s) desta semana serão excluídas permanentemente, incluindo agendamentos de alunos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteWeek.mutate({
                startDate: format(weekStart, "yyyy-MM-dd"),
                endDate: format(weekEnd, "yyyy-MM-dd"),
              }, { onSuccess: () => setShowDeleteWeek(false) })}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir Tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
