import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import { formatDistanceToNow, isPast, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  taskTypeLabels,
  taskPriorityLabels,
  taskPriorityColors,
  taskStatusLabels,
  useCompleteTask,
  type Task,
} from "@/hooks/useTasks";

interface TaskListProps {
  tasks: Task[];
  onTaskUpdate?: () => void;
}

export function TaskList({ tasks, onTaskUpdate }: TaskListProps) {
  const completeTask = useCompleteTask();

  return (
    <div className="space-y-2">
      {tasks.map((t) => {
        const isOverdue =
          t.data_prevista &&
          isPast(parseISO(t.data_prevista)) &&
          t.status !== "concluida" &&
          t.status !== "cancelada";

        return (
          <div
            key={t.id}
            className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
              isOverdue ? "border-destructive/30 bg-destructive/5" : ""
            }`}
          >
            <div className="space-y-0.5 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{t.titulo}</p>
                <Badge
                  variant="outline"
                  className={`text-[10px] shrink-0 ${taskPriorityColors[t.prioridade]}`}
                >
                  {taskPriorityLabels[t.prioridade]}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span>{taskTypeLabels[t.tipo]}</span>
                {t.data_prevista && (
                  <>
                    <span>•</span>
                    <span className={isOverdue ? "text-destructive font-medium" : ""}>
                      {isOverdue ? "Atrasada " : ""}
                      {formatDistanceToNow(parseISO(t.data_prevista), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </>
                )}
                {(t.leads as { name?: string } | null)?.name && (
                  <>
                    <span>•</span>
                    <span>{(t.leads as { name: string }).name}</span>
                  </>
                )}
                {(t.profiles as { full_name?: string } | null)?.full_name && (
                  <>
                    <span>•</span>
                    <span>{(t.profiles as { full_name: string }).full_name}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-3">
              <Badge variant="outline" className="text-[10px]">
                {taskStatusLabels[t.status]}
              </Badge>
              {(t.status === "pendente" || t.status === "em_andamento") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() =>
                    completeTask.mutate({ id: t.id }, {
                      onSuccess: onTaskUpdate,
                    })
                  }
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1" /> Concluir
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
