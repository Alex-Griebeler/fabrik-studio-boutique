import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, Clock, AlertTriangle, Plus, ListTodo } from "lucide-react";
import {
  useTasks,
  usePendingTasksCount,
  useOverdueTasksCount,
  useCompleteTask,
  taskTypeLabels,
  taskPriorityLabels,
  taskPriorityColors,
  taskStatusLabels,
  type TaskFilters,
  type TaskStatus,
  type TaskPriority,
} from "@/hooks/useTasks";
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog";
import { formatDistanceToNow, isPast, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Tasks() {
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState<TaskFilters>({ status: "all", prioridade: "all" });
  const { data: tasks, isLoading } = useTasks(filters.status === "all" && filters.prioridade === "all" ? undefined : filters);
  const { data: pendingCount } = usePendingTasksCount();
  const { data: overdueCount } = useOverdueTasksCount();
  const completeTask = useCompleteTask();

  const todayCompleted = tasks?.filter(t => t.status === "concluida" && t.data_conclusao && new Date(t.data_conclusao).toDateString() === new Date().toDateString()).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tarefas"
        description="Gestão de tarefas e follow-ups"
        actions={
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Nova Tarefa
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KPICard title="Pendentes" value={String(pendingCount ?? 0)} icon={ListTodo} />
        <KPICard title="Atrasadas" value={String(overdueCount ?? 0)} icon={AlertTriangle} />
        <KPICard title="Concluídas Hoje" value={String(todayCompleted)} icon={CheckCircle} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Lista de Tarefas</CardTitle>
          <div className="flex gap-2">
            <Select value={filters.status ?? "all"} onValueChange={v => setFilters(f => ({ ...f, status: v as any }))}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(taskStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.prioridade ?? "all"} onValueChange={v => setFilters(f => ({ ...f, prioridade: v as any }))}>
              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Prioridade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Object.entries(taskPriorityLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !tasks?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ListTodo className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Nenhuma tarefa encontrada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map(t => {
                const isOverdue = t.data_prevista && isPast(parseISO(t.data_prevista)) && t.status !== "concluida" && t.status !== "cancelada";
                return (
                  <div key={t.id} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${isOverdue ? "border-destructive/30 bg-destructive/5" : ""}`}>
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{t.titulo}</p>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${taskPriorityColors[t.prioridade]}`}>
                          {taskPriorityLabels[t.prioridade]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{taskTypeLabels[t.tipo]}</span>
                        {t.data_prevista && (
                          <>
                            <span>•</span>
                            <span className={isOverdue ? "text-destructive font-medium" : ""}>
                              {isOverdue ? "Atrasada " : ""}
                              {formatDistanceToNow(parseISO(t.data_prevista), { addSuffix: true, locale: ptBR })}
                            </span>
                          </>
                        )}
                        {(t.leads as any)?.name && <><span>•</span><span>{(t.leads as any).name}</span></>}
                        {(t.profiles as any)?.full_name && <><span>•</span><span>{(t.profiles as any).full_name}</span></>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <Badge variant="outline" className="text-[10px]">{taskStatusLabels[t.status]}</Badge>
                      {(t.status === "pendente" || t.status === "em_andamento") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => completeTask.mutate({ id: t.id })}
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Concluir
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <TaskFormDialog open={showForm} onOpenChange={setShowForm} />
    </div>
  );
}
