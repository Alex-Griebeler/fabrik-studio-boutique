import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Search, Smartphone, Mail, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Conversation } from "@/hooks/useConversations";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}

const channelIcons: Record<string, typeof Smartphone> = {
  whatsapp: Smartphone,
  email: Mail,
};

const statusColors: Record<string, string> = {
  active: "bg-green-500",
  needs_handoff: "bg-amber-500",
  human_control: "bg-blue-500",
  closed: "bg-muted",
};

export function ConversationList({ conversations, selectedId, onSelect, onDelete }: ConversationListProps) {
  const [search, setSearch] = useState("");

  const filtered = conversations.filter((c) => {
    const leadName = (c.leads?.name || "").toLowerCase();
    const topic = (c.topic || "").toLowerCase();
    return leadName.includes(search.toLowerCase()) || topic.includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Nenhuma conversa</p>
            </div>
          ) : (
            filtered.map((conv) => {
              const ChannelIcon = channelIcons[conv.channel] || Smartphone;
              const isSelected = selectedId === conv.id;
              return (
                <div key={conv.id} className="relative group">
                  <button
                    onClick={() => onSelect(conv.id)}
                    className={`w-full p-3 rounded-lg text-left transition-colors ${
                      isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm truncate flex-1">
                        {conv.leads?.name || "Lead desconhecido"}
                      </span>
                      <div className={`h-2 w-2 rounded-full ${statusColors[conv.status] || "bg-muted"}`} />
                    </div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <ChannelIcon className="h-3 w-3 opacity-60" />
                      <span className="text-xs opacity-70 truncate">
                        {conv.topic || conv.status}
                      </span>
                    </div>
                    {conv.last_message_at && (
                      <span className="text-xs opacity-50">
                        {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    )}
                    {conv.status === "needs_handoff" && (
                      <Badge variant="outline" className="mt-1 text-xs border-amber-500 text-amber-600">
                        Handoff
                      </Badge>
                    )}
                  </button>
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Deletar esta conversa?")) onDelete(conv.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
