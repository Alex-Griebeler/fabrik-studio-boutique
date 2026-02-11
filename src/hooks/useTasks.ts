import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type TaskType = "ligar" | "whatsapp" | "email" | "seguir_experimental" | "fechar_venda" | "outro";
export type TaskPriority = "baixa" | "media" | "alta" | "urgente";
export type TaskStatus = "pendente" | "em_andamento" | "concluida" | "cancelada";

export const taskTypeLabels: Record<TaskType, string> = {
  ligar: "Ligar",
  whatsapp: "WhatsApp",
  email: "E-mail",
  seguir_experimental: "Seguir Experimental",
  fechar_venda: "Fechar Venda",
  outro: "Outro",
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const taskPriorityColors: Record<TaskPriority, string> = {
  baixa: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  media: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  alta: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgente: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em Andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export interface Task {
  id: string;
  tipo: TaskType;
  lead_id: string | null;
  student_id: string | null;
  assignee_id: string;
  titulo: string;
  descricao: string | null;
  data_prevista: string | null;
  prioridade: TaskPriority;
  status: TaskStatus;
  data_conclusao: string | null;
  resultado: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string };
  leads?: { name: string } | null;
  students?: { full_name: string } | null;
}

export interface TaskFormData {
  tipo: TaskType;
  lead_id?: string;
  student_id?: string;
  assignee_id: string;
  titulo: string;
  descricao?: string;
  data_prevista?: string;
  prioridade: TaskPriority;
}

export interface TaskFilters {
  status?: TaskStatus | "all";
  prioridade?: TaskPriority | "all";
  assignee_id?: string;
  overdue?: boolean;
}

export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: ["tasks", filters],
    queryFn: async () => {
      let query = supabase
        .from("tasks")
        .select("*, profiles(full_name), leads(name), students(full_name)")
        .order("data_prevista", { ascending: true, nullsFirst: false })
        .limit(1000);

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters?.prioridade && filters.prioridade !== "all") {
        query = query.eq("prioridade", filters.prioridade);
      }
      if (filters?.assignee_id) {
        query = query.eq("assignee_id", filters.assignee_id);
      }
      if (filters?.overdue) {
        query = query.lt("data_prevista", new Date().toISOString()).in("status", ["pendente", "em_andamento"]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Task[];
    },
  });
}

export function usePendingTasksCount() {
  return useQuery({
    queryKey: ["tasks", "pending-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .in("status", ["pendente", "em_andamento"]);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useOverdueTasksCount() {
  return useQuery({
    queryKey: ["tasks", "overdue-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .lt("data_prevista", new Date().toISOString())
        .in("status", ["pendente", "em_andamento"]);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: TaskFormData) => {
      const { error } = await supabase.from("tasks").insert(data as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa criada!");
    },
    onError: () => toast.error("Erro ao criar tarefa."),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Task> }) => {
      const { error } = await supabase.from("tasks").update(data as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar tarefa."),
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, resultado }: { id: string; resultado?: string }) => {
      const { error } = await supabase.from("tasks").update({
        status: "concluida" as any,
        data_conclusao: new Date().toISOString(),
        resultado: resultado || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa concluída!");
    },
    onError: () => toast.error("Erro ao concluir tarefa."),
  });
}
