import { useState, useEffect, useCallback } from "react";
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*, leads:lead_id(name, phone, email, status, qualification_score, tags, temperature, source, trial_date)")
        .order("last_message_at", { ascending: false });

      if (error) throw error;
      setConversations((data as any) || []);
    } catch (error) {
      toast({ title: "Erro ao carregar conversas", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages((data as any) || []);
    } catch (error) {
      toast({ title: "Erro ao carregar mensagens", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    }
  }, [toast]);

  // Load conversations on mount
  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages when selected conversation changes
  useEffect(() => {
    if (selectedConvId) loadMessages(selectedConvId);
    else setMessages([]);
  }, [selectedConvId, loadMessages]);

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
        setMessages((prev) => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConvId]);

  const sendMessage = useCallback(async (message: string) => {
    if (!selectedConvId || !message.trim()) return;
    setSending(true);
    try {
      const response = await supabase.functions.invoke("process-conversation-message", {
        body: { conversation_id: selectedConvId, message },
      });

      if (response.error) throw new Error(response.error.message);

      const data = response.data;
      if (data?.error) {
        toast({ title: "Erro do Agente IA", description: data.error, variant: "destructive" });
      }
      // Realtime will update messages, but also refresh conversations list
      loadConversations();
    } catch (error) {
      toast({ title: "Erro ao enviar mensagem", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [selectedConvId, toast, loadConversations]);

  const takeOverConversation = useCallback(async () => {
    if (!selectedConvId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase
        .from("conversations")
        .update({ taken_over_by: user.id, taken_over_at: new Date().toISOString(), status: "human_control" })
        .eq("id", selectedConvId);

      if (error) throw error;
      loadConversations();
      toast({ title: "Conversa assumida com sucesso" });
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    }
  }, [selectedConvId, toast, loadConversations]);

  const releaseConversation = useCallback(async () => {
    if (!selectedConvId) return;
    try {
      const { error } = await supabase
        .from("conversations")
        .update({ taken_over_by: null, taken_over_at: null, status: "active" })
        .eq("id", selectedConvId);

      if (error) throw error;
      loadConversations();
      toast({ title: "Conversa devolvida ao agente IA" });
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    }
  }, [selectedConvId, toast, loadConversations]);

  const deleteConversation = useCallback(async (convId: string) => {
    try {
      const { error } = await supabase.from("conversations").delete().eq("id", convId);
      if (error) throw error;
      if (selectedConvId === convId) setSelectedConvId(null);
      loadConversations();
      toast({ title: "Conversa deletada" });
    } catch (error) {
      toast({ title: "Erro ao deletar", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    }
  }, [selectedConvId, toast, loadConversations]);

  const selectedConversation = conversations.find(c => c.id === selectedConvId) || null;

  return {
    conversations,
    selectedConvId,
    setSelectedConvId,
    selectedConversation,
    messages,
    loading,
    sending,
    sendMessage,
    takeOverConversation,
    releaseConversation,
    deleteConversation,
    refreshConversations: loadConversations,
  };
}
