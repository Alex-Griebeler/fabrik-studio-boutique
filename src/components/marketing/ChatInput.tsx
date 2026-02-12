import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, UserCheck, Bot } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  sending: boolean;
  isTakenOver: boolean;
  onTakeOver: () => void;
  onRelease: () => void;
}

export function ChatInput({ onSend, sending, isTakenOver, onTakeOver, onRelease }: ChatInputProps) {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (!message.trim() || sending) return;
    onSend(message.trim());
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {isTakenOver ? "Você está controlando a conversa" : "Agente IA respondendo automaticamente"}
        </span>
        <Button
          variant={isTakenOver ? "default" : "outline"}
          size="sm"
          onClick={isTakenOver ? onRelease : onTakeOver}
          className="text-xs h-7"
        >
          {isTakenOver ? (
            <><Bot className="h-3 w-3 mr-1" /> Devolver ao IA</>
          ) : (
            <><UserCheck className="h-3 w-3 mr-1" /> Assumir Conversa</>
          )}
        </Button>
      </div>
      <div className="flex gap-2">
        <Textarea
          placeholder="Digite sua mensagem..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="resize-none min-h-[40px] max-h-[120px]"
          rows={1}
        />
        <Button onClick={handleSend} disabled={sending || !message.trim()} size="icon" className="shrink-0">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
