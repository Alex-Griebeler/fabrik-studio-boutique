
-- =============================================
-- SPRINT 6: MARKETING IA - ALL MIGRATIONS
-- =============================================

-- FASE 6.1: Conversas AI
-- Add columns to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS taken_over_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS taken_over_at timestamptz;

-- Add metadata to conversation_messages
ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

-- Create ai_conversation_logs for cost tracking
CREATE TABLE public.ai_conversation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_conversation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_conversation_logs_admin_full" ON public.ai_conversation_logs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "ai_conversation_logs_reception_select" ON public.ai_conversation_logs
  FOR SELECT USING (has_role(auth.uid(), 'reception'::app_role));

-- Enable realtime for conversation_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;

-- FASE 6.2: AI Agent Config
ALTER TABLE public.ai_agent_config
  ADD COLUMN IF NOT EXISTS knowledge_base jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS handoff_rules jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS behavior_config jsonb NOT NULL DEFAULT '{}';

-- FASE 6.3: Nurturing Sequences
-- Add columns to sequence_steps
ALTER TABLE public.sequence_steps
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS condition jsonb;

-- Create sequence_executions
CREATE TABLE public.sequence_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.nurturing_sequences(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  current_step integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  next_step_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sequence_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sequence_executions_admin_full" ON public.sequence_executions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sequence_executions_reception_select" ON public.sequence_executions
  FOR SELECT USING (has_role(auth.uid(), 'reception'::app_role));

-- Create sequence_step_events
CREATE TABLE public.sequence_step_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.sequence_executions(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.sequence_steps(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sequence_step_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sequence_step_events_admin_full" ON public.sequence_step_events
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sequence_step_events_reception_select" ON public.sequence_step_events
  FOR SELECT USING (has_role(auth.uid(), 'reception'::app_role));

-- Trigger for updated_at on sequence_executions
CREATE TRIGGER update_sequence_executions_updated_at
  BEFORE UPDATE ON public.sequence_executions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
