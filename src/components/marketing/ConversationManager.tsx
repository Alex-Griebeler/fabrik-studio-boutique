import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useConversations } from "@/hooks/useConversations";
import { ConversationList } from "./ConversationList";
import { ChatTimeline } from "./ChatTimeline";
import { ChatInput } from "./ChatInput";
import { LeadContextPanel } from "./LeadContextPanel";

export function ConversationManager() {
  const {
    conversations,
    selectedConvId,
    setSelectedConvId,
    selectedConversation,
    messages,
    sending,
    sendMessage,
    takeOverConversation,
    releaseConversation,
    deleteConversation,
  } = useConversations();

  const isTakenOver = selectedConversation?.status === "human_control";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      {/* Left: Conversation List */}
      <Card className="col-span-1 overflow-hidden">
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm font-semibold">Conversas</CardTitle>
        </CardHeader>
        <ConversationList
          conversations={conversations}
          selectedId={selectedConvId}
          onSelect={setSelectedConvId}
          onDelete={(id) => deleteConversation(id)}
        />
      </Card>

      {/* Center: Chat */}
      <Card className="md:col-span-2 flex flex-col overflow-hidden">
        {selectedConvId ? (
          <>
            <CardHeader className="py-3 px-4 border-b shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  {selectedConversation?.leads?.name || "Chat"}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (selectedConvId && confirm("Deletar esta conversa?")) {
                      deleteConversation(selectedConvId);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <ScrollArea className="flex-1">
              <ChatTimeline messages={messages} />
            </ScrollArea>
            <ChatInput
              onSend={sendMessage}
              sending={sending}
              isTakenOver={isTakenOver}
              onTakeOver={takeOverConversation}
              onRelease={releaseConversation}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Selecione uma conversa</p>
          </div>
        )}
      </Card>

      {/* Right: Lead Context */}
      <Card className="col-span-1 overflow-hidden hidden lg:block">
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm font-semibold">Contexto do Lead</CardTitle>
        </CardHeader>
        <ScrollArea className="flex-1">
          <LeadContextPanel conversation={selectedConversation} />
        </ScrollArea>
      </Card>
    </div>
  );
}
