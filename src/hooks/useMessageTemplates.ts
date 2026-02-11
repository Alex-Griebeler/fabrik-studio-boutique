import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useMessageTemplates(category?: string) {
  return useQuery({
    queryKey: ["message_templates", category],
    queryFn: async () => {
      let query = supabase
        .from("message_templates")
        .select("*")
        .eq("is_active", true);

      if (category) {
        query = query.eq("category", category);
      }

      const { data, error } = await query.order("name");
      if (error) throw error;
      return data as MessageTemplate[];
    },
  });
}

export function useAllMessageTemplates() {
  return useQuery({
    queryKey: ["message_templates_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("is_active", true)
        .order("category")
        .order("name");
      if (error) throw error;
      return data as MessageTemplate[];
    },
  });
}

export function useCreateMessageTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<MessageTemplate, "id" | "created_at" | "updated_at">) => {
      const { error } = await supabase
        .from("message_templates")
        .insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message_templates"] });
      qc.invalidateQueries({ queryKey: ["message_templates_all"] });
      toast.success("Template criado!");
    },
    onError: () => toast.error("Erro ao criar template."),
  });
}

// Função para substituir variáveis no template
export function substituteVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replace(`[${key}]`, value || "");
  });
  return result;
}
