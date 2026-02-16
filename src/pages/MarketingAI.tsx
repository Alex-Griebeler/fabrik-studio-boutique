import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Settings, Zap } from "lucide-react";
import { ConversationManager } from "@/components/marketing/ConversationManager";
import { AIAgentConfig } from "@/components/marketing/AIAgentConfig";
import { SequenceBuilder } from "@/components/marketing/SequenceBuilder";

export default function MarketingAI() {
  const [activeTab, setActiveTab] = useState("conversations");

  return (
    <div>
      <PageHeader 
        title="Marketing IA" 
        description="Gerenciador de conversas, configuração de agente e sequências de nurturing"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="conversations" className="gap-1.5">
            <MessageSquare className="h-4 w-4" />
            Conversas
          </TabsTrigger>
          <TabsTrigger value="ai-agent" className="gap-1.5">
            <Settings className="h-4 w-4" />
            Agente IA
          </TabsTrigger>
          <TabsTrigger value="sequences" className="gap-1.5">
            <Zap className="h-4 w-4" />
            Sequências
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversations">
          <ConversationManager />
        </TabsContent>

        <TabsContent value="ai-agent">
          <div><AIAgentConfig /></div>
        </TabsContent>

        <TabsContent value="sequences">
          <div><SequenceBuilder /></div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
