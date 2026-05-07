-- =============================================================
-- Agente de detecção de faltas — schema base
-- =============================================================
-- Adiciona:
--   1. Enums:                attendance_alert_status, attendance_alert_mode
--   2. Tabela:               public.attendance_alerts
--   3. Índices               (lookup por aluno, treinador, status)
--   4. Triggers              (updated_at, audit_log)
--   5. Row-level security    (admin/staff lê tudo, edge function escreve via service_role)
--   6. Policies seeds        (chaves padrão pro agente)
-- =============================================================

-- ─────────── 1. Enums ───────────
DO $$ BEGIN
  CREATE TYPE public.attendance_alert_status AS ENUM (
    'pending',           -- gerado, aguardando ack do treinador
    'acknowledged',      -- treinador confirmou que falou com aluno
    'escalated',         -- 24h passaram sem ack → vai pra Raquel
    'resolved',          -- Raquel ou treinador marcou resolvido
    'suppressed'         -- silenciado (janela de silêncio, dedupe, etc.)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_alert_mode AS ENUM ('shadow', 'live');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────── 2. Tabela attendance_alerts ───────────
CREATE TABLE IF NOT EXISTS public.attendance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quem
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  trainer_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,
  escalated_to_trainer_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,

  -- Contexto
  alert_type text NOT NULL CHECK (alert_type IN ('group_2_misses', 'pt_1_miss')),
  missed_session_ids uuid[] NOT NULL DEFAULT '{}',
  missed_booking_ids uuid[] NOT NULL DEFAULT '{}',
  missed_dates date[] NOT NULL DEFAULT '{}',
  last_attended_at date,
  plan_snapshot jsonb,                    -- {plan_name, category, frequency} no momento da geração

  -- Estado
  status public.attendance_alert_status NOT NULL DEFAULT 'pending',
  mode public.attendance_alert_mode NOT NULL DEFAULT 'shadow',
  suppress_reason text,

  -- Comunicação
  ack_token text UNIQUE NOT NULL,         -- token aleatório usado no link do WhatsApp
  message_sid text,                       -- ID do envio Twilio (treinador)
  escalation_message_sid text,            -- ID do envio Twilio (Raquel)
  message_to text,                        -- destino real (telefone que recebeu)

  -- Timestamps
  detected_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_via text,                  -- 'whatsapp_link' | 'manual' | 'task'
  escalated_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────── 3. Índices ───────────
CREATE INDEX IF NOT EXISTS attendance_alerts_student_idx
  ON public.attendance_alerts(student_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS attendance_alerts_trainer_idx
  ON public.attendance_alerts(trainer_id, status);

CREATE INDEX IF NOT EXISTS attendance_alerts_pending_idx
  ON public.attendance_alerts(status, notified_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS attendance_alerts_ack_token_idx
  ON public.attendance_alerts(ack_token);

-- Dedupe: pra cada aluno, no máximo um alerta pendente ou escalado por vez.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_alerts_one_open_per_student
  ON public.attendance_alerts(student_id)
  WHERE status IN ('pending', 'escalated');

-- ─────────── 4. Triggers ───────────
CREATE OR REPLACE FUNCTION public.set_attendance_alerts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attendance_alerts_set_updated_at ON public.attendance_alerts;
CREATE TRIGGER attendance_alerts_set_updated_at
BEFORE UPDATE ON public.attendance_alerts
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_alerts_updated_at();

-- ─────────── 5. RLS ───────────
ALTER TABLE public.attendance_alerts ENABLE ROW LEVEL SECURITY;

-- Staff/admin lê tudo. Edge functions usando service_role bypassam RLS naturalmente.
DO $$ BEGIN
  CREATE POLICY attendance_alerts_select_staff
    ON public.attendance_alerts
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'manager', 'reception')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Treinador vê alertas dele
DO $$ BEGIN
  CREATE POLICY attendance_alerts_select_trainer
    ON public.attendance_alerts
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.trainers t
        WHERE t.profile_id = auth.uid()
          AND (t.id = attendance_alerts.trainer_id OR t.id = attendance_alerts.escalated_to_trainer_id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────── 6. Policies seeds (config do agente) ───────────
INSERT INTO public.policies (key, value, description)
VALUES
  ('attendance_agent.mode',
    '"shadow"'::jsonb,
    'Modo do agente de faltas: "shadow" (envia só pro telefone shadow) ou "live" (envia pros treinadores).'),

  ('attendance_agent.shadow_phone',
    '""'::jsonb,
    'Telefone E.164 que recebe TODOS os alertas em modo shadow (ex: "+5561999999999").'),

  ('attendance_agent.silence_window_days',
    '3'::jsonb,
    'Quantos dias suprimir novos alertas pro mesmo aluno depois de um ack.'),

  ('attendance_agent.escalation_hours',
    '24'::jsonb,
    'Horas sem ack do treinador antes de escalar pra Raquel.'),

  ('attendance_agent.fallback_trainer_id',
    'null'::jsonb,
    'UUID do treinador "Raquel" pra escalação. Se null, escalação loga warning.'),

  ('attendance_agent.send_window',
    '{"start_hour": 9, "end_hour": 19, "days_of_week": [1,2,3,4,5]}'::jsonb,
    'Janela horária pra envio (timezone America/Sao_Paulo). Fora disso, mensagens ficam pendentes.'),

  ('attendance_agent.timezone',
    '"America/Sao_Paulo"'::jsonb,
    'Timezone usado pra avaliar janela horária e datas de sessão.'),

  ('attendance_agent.lookback_days',
    '14'::jsonb,
    'Quantos dias pra trás varrer pra montar histórico de presença por aluno.')
ON CONFLICT (key) DO NOTHING;
