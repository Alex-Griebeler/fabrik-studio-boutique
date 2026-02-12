import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Bot, User } from "lucide-react";
import { format } from "date-fns";
import type { ConversationMessage } from "@/hooks/useConversations";

interface ChatTimelineProps {
  messages: ConversationMessage[];
}

export function ChatTimeline({ messages }: ChatTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Inicie a conversa enviando uma mensagem</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {messages.map((msg) => {
        if (msg.role === "system") {
          return (
            <div key={msg.id} className="flex justify-center">
              <Badge variant="secondary" className="text-xs">
                {msg.content}
              </Badge>
            </div>
          );
        }

        const isUser = msg.role === "user";
        return (
          <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2`}>
            {!isUser && (
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-1">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div className={`max-w-[75%] space-y-1`}>
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm ${
                  isUser
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted rounded-tl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              <div className={`flex items-center gap-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
                {msg.ai_generated && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">IA</Badge>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(msg.created_at), "HH:mm")}
                </span>
              </div>
            </div>
            {isUser && (
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
