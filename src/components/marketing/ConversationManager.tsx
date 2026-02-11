import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { MessageSquare, Plus, Send, Trash2 } from "lucide-react";

interface Conversation {
  id: string;
  lead_id: string;
  agent_id: string | null;
  status: string;
  topic: string | null;
  last_message_at: string | null;
  created_at: string;
}

interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  ai_generated: boolean;
  created_at: string;
}

export function ConversationManager() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (selectedConvId) {
      loadMessages(selectedConvId);
    }
  }, [selectedConvId]);

  const loadConversations = async () => {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false });

      if (error) throw error;
      setConversations(data || []);
      if (data && data.length > 0 && !selectedConvId) {
        setSelectedConvId(data[0].id);
      }
    } catch (error) {
      toast({
        title: "Erro ao carregar conversas",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  };

  const loadMessages = async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      toast({
        title: "Erro ao carregar mensagens",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConvId) return;

    setLoading(true);
    try {
      // Add user message
      const { data: msgData, error: msgError } = await supabase
        .from("conversation_messages")
        .insert({
          conversation_id: selectedConvId,
          role: "user",
          content: newMessage,
          ai_generated: false
        })
        .select();

      if (msgError) throw msgError;

      // Update conversation last_message_at
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", selectedConvId);

      setNewMessage("");
      loadMessages(selectedConvId);
      
      // TODO: Call AI agent to generate response
      toast({
        title: "Mensagem enviada",
        description: "Aguardando resposta do agente IA..."
      });
    } catch (error) {
      toast({
        title: "Erro ao enviar mensagem",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    try {
      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", convId);

      if (error) throw error;

      if (selectedConvId === convId) {
        setSelectedConvId(null);
      }
      loadConversations();
      toast({ title: "Conversa deletada com sucesso" });
    } catch (error) {
      toast({
        title: "Erro ao deletar conversa",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Conversations List */}
      <Card className="col-span-1">
        <CardHeader>
          <CardTitle className="text-lg">Conversas</CardTitle>
          <CardDescription>Gerenciamento de conversas com leads</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Nenhuma conversa iniciada</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  selectedConvId === conv.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                <div className="font-medium text-sm truncate">
                  {conv.topic || "Sem tópico"}
                </div>
                <div className="text-xs opacity-70 truncate">
                  {conv.status}
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      {/* Chat Area */}
      <Card className="col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Chat</CardTitle>
              <CardDescription>Conversa em tempo real</CardDescription>
            </div>
            {selectedConvId && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteConversation(selectedConvId)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedConvId ? (
            <>
              <div className="border rounded-lg p-4 h-64 overflow-y-auto space-y-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p className="text-sm">Inicie a conversa</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`rounded-lg p-3 max-w-xs ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <Textarea
                  placeholder="Digite sua mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="resize-none"
                  rows={2}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={loading || !newMessage.trim()}
                  size="sm"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-96 text-muted-foreground">
              <p>Selecione uma conversa</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
