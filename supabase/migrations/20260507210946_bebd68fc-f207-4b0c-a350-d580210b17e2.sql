-- Enums
DO $$ BEGIN
  CREATE TYPE public.attendance_alert_status AS ENUM ('pending','acknowledged','escalated','resolved','suppressed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_alert_mode AS ENUM ('shadow', 'live');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela
CREATE TABLE IF NOT EXISTS public.attendance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  trainer_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,
  escalated_to_trainer_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('group_2_misses', 'pt_1_miss')),
  missed_session_ids uuid[] NOT NULL DEFAULT '{}',
  missed_booking_ids uuid[] NOT NULL DEFAULT '{}',
  missed_dates date[] NOT NULL DEFAULT '{}',
  last_attended_at date,
  plan_snapshot jsonb,
  status public.attendance_alert_status NOT NULL DEFAULT 'pending',
  mode public.attendance_alert_mode NOT NULL DEFAULT 'shadow',
  suppress_reason text,
  ack_token text UNIQUE NOT NULL,
  message_sid text,
  escalation_message_sid text,
  message_to text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_via text,
  escalated_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_alerts_student_idx ON public.attendance_alerts(student_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS attendance_alerts_trainer_idx ON public.attendance_alerts(trainer_id, status);
CREATE INDEX IF NOT EXISTS attendance_alerts_pending_idx ON public.attendance_alerts(status, notified_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS attendance_alerts_ack_token_idx ON public.attendance_alerts(ack_token);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_alerts_one_open_per_student ON public.attendance_alerts(student_id) WHERE status IN ('pending', 'escalated');

CREATE OR REPLACE FUNCTION public.set_attendance_alerts_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS attendance_alerts_set_updated_at ON public.attendance_alerts;
CREATE TRIGGER attendance_alerts_set_updated_at
BEFORE UPDATE ON public.attendance_alerts
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_alerts_updated_at();

ALTER TABLE public.attendance_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY attendance_alerts_select_staff
    ON public.attendance_alerts FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'manager', 'reception')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY attendance_alerts_select_trainer
    ON public.attendance_alerts FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.trainers t
        WHERE t.profile_id = auth.uid()
          AND (t.id = attendance_alerts.trainer_id OR t.id = attendance_alerts.escalated_to_trainer_id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.policies (key, value, description) VALUES
  ('attendance_agent.mode', '"shadow"'::jsonb, 'Modo do agente de faltas: "shadow" ou "live".'),
  ('attendance_agent.shadow_phone', '""'::jsonb, 'Telefone E.164 que recebe TODOS os alertas em modo shadow.'),
  ('attendance_agent.silence_window_days', '3'::jsonb, 'Dias suprimir novos alertas pro mesmo aluno após ack.'),
  ('attendance_agent.escalation_hours', '24'::jsonb, 'Horas sem ack antes de escalar pra Raquel.'),
  ('attendance_agent.fallback_trainer_id', 'null'::jsonb, 'UUID do treinador Raquel pra escalação.'),
  ('attendance_agent.send_window', '{"start_hour": 9, "end_hour": 19, "days_of_week": [1,2,3,4,5]}'::jsonb, 'Janela horária de envio (America/Sao_Paulo).'),
  ('attendance_agent.timezone', '"America/Sao_Paulo"'::jsonb, 'Timezone do agente.'),
  ('attendance_agent.lookback_days', '14'::jsonb, 'Dias de lookback pra histórico de presença.')
ON CONFLICT (key) DO NOTHING;