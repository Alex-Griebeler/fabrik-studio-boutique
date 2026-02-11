import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMessageTemplates, substituteVariables } from "@/hooks/useMessageTemplates";
import { MessageCircle } from "lucide-react";
import type { Lead } from "@/hooks/useLeads";

interface TemplateSelectorProps {
  lead: Lead;
  onSend?: (message: string) => void;
}

export function TemplateSelector({ lead, onSend }: TemplateSelectorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [message, setMessage] = useState("");
  const { data: templates = [] } = useMessageTemplates();

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      const variables: Record<string, string> = {
        NOME: lead.name,
        TELEFONE: lead.phone || "",
        DATA: lead.trial_date || "",
        HORA: lead.trial_time || "",
        EMAIL: lead.email || "",
      };
      const substituted = substituteVariables(template.content, variables);
      setMessage(substituted);
    }
  };

  const handleSend = () => {
    if (onSend && message.trim()) {
      onSend(message);
      setMessage("");
      setSelectedTemplate("");
    }
  };

  // Group templates by category
  const groupedTemplates = templates.reduce(
    (acc, template) => {
      if (!acc[template.category]) {
        acc[template.category] = [];
      }
      acc[template.category].push(template);
      return acc;
    },
    {} as Record<string, typeof templates>
  );

  const categoryLabels: Record<string, string> = {
    "1o_contato": "1º Contato",
    lembrete_exp: "Lembrete Experimental",
    pos_experimental: "Pós-Experimental",
    follow_up: "Follow-up",
    resgate: "Resgate",
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="template-select">Selecionar Template</Label>
        <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
          <SelectTrigger id="template-select">
            <SelectValue placeholder="Escolha um template..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(groupedTemplates).map(([category, items]) => (
              <div key={category}>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  {categoryLabels[category] || category}
                </div>
                {items.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      {message && (
        <div className="space-y-2">
          <Label htmlFor="message-preview">Mensagem</Label>
          <Textarea
            id="message-preview"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Sua mensagem aqui..."
            className="min-h-[120px]"
          />
          <p className="text-xs text-muted-foreground">
            💡 Você pode editar a mensagem antes de enviar
          </p>

          <Button
            onClick={handleSend}
            size="sm"
            className="w-full"
            disabled={!message.trim()}
          >
            <MessageCircle className="mr-2 h-4 w-4" /> Enviar via WhatsApp
          </Button>
        </div>
      )}
    </div>
  );
}
