-- Criar tabela de templates de mensagens
CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- '1o_contato', 'lembrete_exp', 'pos_experimental', 'follow_up', 'resgate'
  content TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}', -- Exemplo: ['NOME', 'TELEFONE', 'DATA']
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "message_templates_select" ON public.message_templates
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'reception'::app_role)
);

CREATE POLICY "message_templates_insert" ON public.message_templates
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "message_templates_update" ON public.message_templates
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "message_templates_delete" ON public.message_templates
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default templates
INSERT INTO public.message_templates (name, category, content, variables, is_active) VALUES
('Oi [NOME]! Vi que você se interessou pelo Fabrik...', '1o_contato', 'Oi [NOME]! 👋 Vi que você se interessou pelo Fabrik. Somos especializados em treinamento funcional e temos uma metodologia super eficaz. Que tal agendar uma aula experimental gratuita para você conhecer nosso espaço? 💪', ARRAY['NOME', 'TELEFONE'], true),
('Oi [NOME], tudo bem?', 'lembrete_exp', 'Oi [NOME]! 👋 Só um lembrete: sua aula experimental está marcada para [DATA] às [HORA]. Fica à vontade para tirar dúvidas. Até lá! 💪', ARRAY['NOME', 'DATA', 'HORA'], true),
('Gostou da sua aula?', 'pos_experimental', 'Oi [NOME]! 🎉 Como foi sua experiência no Fabrik? Você curtiu? Temos planos super acessíveis para você começar. Quer conhecer as opções?', ARRAY['NOME'], true),
('Voltamos a entrar em contato!', 'follow_up', 'Oi [NOME], tudo bem? Ficou com alguma dúvida sobre o Fabrik? Posso te ajudar! 😊', ARRAY['NOME'], true),
('Última chance!', 'resgate', 'Oi [NOME]! 👋 Não queremos que você fique de fora! Essa é sua última oportunidade de agendar uma aula experimental essa semana. Vem aí! 💪', ARRAY['NOME'], true),
('Vídeo do Studio Fabrik', '1o_contato', 'Olha só que legal nosso estúdio! [VIDEO_URL] Quer conhecer pessoalmente? 🎥', ARRAY['NOME', 'VIDEO_URL'], true),
('Depoimentos de alunos', 'follow_up', 'Veja o que nossos alunos estão achando do Fabrik: [DEPOIMENTO_URL] Você quer fazer parte dessa comunidade? ✨', ARRAY['NOME', 'DEPOIMENTO_URL'], true)
ON CONFLICT DO NOTHING;