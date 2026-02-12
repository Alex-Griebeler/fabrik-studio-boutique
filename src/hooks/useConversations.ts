import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export interface Conversation {
  id: string;
  lead_id: string;
  agent_id: string | null;
  status: string;
  topic: string | null;
  channel: string;
  context: Record<string, any>;
  taken_over_by: string | null;
  taken_over_at: string | null;
  last_message_at: string | null;
  created_at: string;
  leads?: {
    name: string;
    phone: string | null;
    email: string | null;
    status: string;
    qualification_score: number;
    tags: string[];
    temperature: string | null;
    source: string | null;
    trial_date: string | null;
  };
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  ai_generated: boolean;
  metadata: Record<string, any>;
  created_at: string;
}

export function useConversations() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Query: Load all conversations
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*, leads:lead_id(name, phone, email, status, qualification_score, tags, temperature, source, trial_date)")
        .order("last_message_at", { ascending: false });

      if (error) throw error;
      return (data as Conversation[]) || [];
    },
    staleTime: 5000,
  });

  // Query: Load messages for selected conversation
  const { data: messages = [] } = useQuery({
    queryKey: ["conversation_messages", selectedConvId],
    queryFn: async () => {
      if (!selectedConvId) return [];
      const { data, error } = await supabase
        .from("conversation_messages")
        .select("*")
        .eq("conversation_id", selectedConvId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data as ConversationMessage[]) || [];
    },
    enabled: !!selectedConvId,
    staleTime: 1000,
  });

  // Realtime subscription for messages
  useEffect(() => {
    if (!selectedConvId) return;

    const channel = supabase
      .channel(`conv-messages-${selectedConvId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "conversation_messages",
        filter: `conversation_id=eq.${selectedConvId}`,
      }, (payload) => {
        const newMsg = payload.new as ConversationMessage;
        queryClient.setQueryData(["conversation_messages", selectedConvId], (prev: ConversationMessage[] = []) => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConvId, queryClient]);

  // Mutation: Send message
  const { mutate: sendMessage, isPending: isSending } = useMutation({
    mutationFn: async (message: string) => {
      if (!selectedConvId || !message.trim()) throw new Error("Mensagem vazia");
      const response = await supabase.functions.invoke("process-conversation-message", {
        body: { conversation_id: selectedConvId, message },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : "Erro ao enviar mensagem";
      toast({ title: "Erro", description: errorMessage, variant: "destructive" });
    },
  });

  // Mutation: Take over conversation
  const { mutate: takeOverConversation } = useMutation({
    mutationFn: async () => {
      if (!selectedConvId) throw new Error("Nenhuma conversa selecionada");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase
        .from("conversations")
        .update({ taken_over_by: user.id, taken_over_at: new Date().toISOString(), status: "human_control" })
        .eq("id", selectedConvId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({ title: "Conversa assumida com sucesso" });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    },
  });

  // Mutation: Release conversation
  const { mutate: releaseConversation } = useMutation({
    mutationFn: async () => {
      if (!selectedConvId) throw new Error("Nenhuma conversa selecionada");
      const { error } = await supabase
        .from("conversations")
        .update({ taken_over_by: null, taken_over_at: null, status: "active" })
        .eq("id", selectedConvId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({ title: "Conversa devolvida ao agente IA" });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    },
  });

  // Mutation: Delete conversation
  const { mutate: deleteConversation } = useMutation({
    mutationFn: async (convId: string) => {
      const { error } = await supabase.from("conversations").delete().eq("id", convId);
      if (error) throw error;
    },
    onSuccess: (_, deletedId) => {
      if (selectedConvId === deletedId) setSelectedConvId(null);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({ title: "Conversa deletada" });
    },
    onError: (error) => {
      toast({ title: "Erro ao deletar", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    },
  });

  const selectedConversation = conversations.find(c => c.id === selectedConvId) || null;

  return {
    conversations,
    selectedConvId,
    setSelectedConvId,
    selectedConversation,
    messages,
    loading: isLoading,
    sending: isSending,
    sendMessage,
    takeOverConversation,
    releaseConversation,
    deleteConversation,
    refreshConversations: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  };
}
