
-- Create conversations table for AI marketing conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'active',
  topic TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create conversation messages table
CREATE TABLE public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create AI agent configuration table
CREATE TABLE public.ai_agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT,
  temperature NUMERIC DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 2000,
  is_active BOOLEAN DEFAULT true,
  model TEXT DEFAULT 'google/gemini-3-flash-preview',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create nurturing sequences table
CREATE TABLE public.nurturing_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_status TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sequence steps table
CREATE TABLE public.sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES nurturing_sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  delay_hours INTEGER DEFAULT 0,
  message_template_id UUID REFERENCES message_templates(id),
  message_content TEXT,
  action_type TEXT,
  order_num INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sequence logs table (tracks which leads have completed which sequences)
CREATE TABLE public.sequence_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES nurturing_sequences(id),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'started',
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nurturing_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for conversations
CREATE POLICY "conversations_admin_full" ON public.conversations
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "conversations_reception_select" ON public.conversations
  FOR SELECT USING (has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "conversations_reception_insert" ON public.conversations
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "conversations_reception_update" ON public.conversations
  FOR UPDATE USING (has_role(auth.uid(), 'reception'::app_role));

-- Create RLS policies for conversation messages
CREATE POLICY "conversation_messages_admin_full" ON public.conversation_messages
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "conversation_messages_reception_select" ON public.conversation_messages
  FOR SELECT USING (has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "conversation_messages_reception_insert" ON public.conversation_messages
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'reception'::app_role));

-- Create RLS policies for AI agent config
CREATE POLICY "ai_agent_config_admin_full" ON public.ai_agent_config
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "ai_agent_config_reception_select" ON public.ai_agent_config
  FOR SELECT USING (has_role(auth.uid(), 'reception'::app_role));

-- Create RLS policies for nurturing sequences
CREATE POLICY "nurturing_sequences_admin_full" ON public.nurturing_sequences
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "nurturing_sequences_reception_select" ON public.nurturing_sequences
  FOR SELECT USING (has_role(auth.uid(), 'reception'::app_role));

-- Create RLS policies for sequence steps
CREATE POLICY "sequence_steps_admin_full" ON public.sequence_steps
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sequence_steps_reception_select" ON public.sequence_steps
  FOR SELECT USING (has_role(auth.uid(), 'reception'::app_role));

-- Create RLS policies for sequence logs
CREATE POLICY "sequence_logs_admin_full" ON public.sequence_logs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sequence_logs_reception_select" ON public.sequence_logs
  FOR SELECT USING (has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "sequence_logs_reception_insert" ON public.sequence_logs
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "sequence_logs_reception_update" ON public.sequence_logs
  FOR UPDATE USING (has_role(auth.uid(), 'reception'::app_role));

-- Create update triggers for timestamps
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_agent_config_updated_at
  BEFORE UPDATE ON public.ai_agent_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_nurturing_sequences_updated_at
  BEFORE UPDATE ON public.nurturing_sequences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sequence_logs_updated_at
  BEFORE UPDATE ON public.sequence_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
