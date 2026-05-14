-- =============================================================
-- Detector de churn / evasão — schema base
-- =============================================================
-- Agente irmão do detector de faltas. Enquanto `attendance_alerts`
-- guarda o sinal AGUDO (2 faltas seguidas), `churn_alerts` guarda o
-- sinal CRÔNICO: aluno cuja frequência semanal vem caindo de forma
-- sustentada vs a própria baseline histórica.
--
-- Adiciona:
--   1. Tabela:            public.churn_alerts
--   2. Índices            (lookup por aluno / treinador / status)
--   3. Trigger            (updated_at)
--   4. Row-level security (staff lê tudo; treinador vê os dele;
--                          edge function escreve via service_role)
--   5. Policies seeds     (config do agente — chaves churn_agent.*)
--
-- MVP shadow: a edge function `detect-churn-risk` DETECTA e PERSISTE
-- linhas aqui. NÃO manda WhatsApp ainda — envio é follow-up depois de
-- validar a qualidade da detecção com histórico maduro.
-- =============================================================

-- ─────────── 1. Tabela churn_alerts ───────────
CREATE TABLE IF NOT EXISTS public.churn_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quem
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  -- Treinador "principal" do aluno no momento da detecção (roteamento
  -- futuro do alerta). Pode ser null se não der pra inferir.
  trainer_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,

  -- Sinal medido pelo helper `evaluateChurnRisk`
  confidence text NOT NULL CHECK (confidence IN ('full', 'provisional')),
  recent_weekly_avg numeric NOT NULL,
  baseline_weekly_avg numeric NOT NULL,
  drop_pct numeric NOT NULL,
  recent_weeks_used integer NOT NULL,
  baseline_weeks_used integer NOT NULL,
  threshold_applied numeric NOT NULL,
  -- Janela de dados que embasou a avaliação (pra auditoria)
  data_start date NOT NULL,
  data_end date NOT NULL,

  -- Estado
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'suppressed')),
  mode text NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'live')),

  -- Timestamps
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────── 2. Índices ───────────
CREATE INDEX IF NOT EXISTS churn_alerts_student_idx
  ON public.churn_alerts(student_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS churn_alerts_trainer_idx
  ON public.churn_alerts(trainer_id, status);

-- Dedupe: no máximo um alerta de churn ABERTO por aluno. O detector
-- roda semanalmente — se o aluno continua em churn, NÃO recria; o
-- alerta aberto se mantém até ack/resolve. (Insert bate 23505 → skip.)
CREATE UNIQUE INDEX IF NOT EXISTS churn_alerts_one_open_per_student
  ON public.churn_alerts(student_id)
  WHERE status = 'open';

-- ─────────── 3. Trigger updated_at ───────────
CREATE OR REPLACE FUNCTION public.set_churn_alerts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS churn_alerts_set_updated_at ON public.churn_alerts;
CREATE TRIGGER churn_alerts_set_updated_at
BEFORE UPDATE ON public.churn_alerts
FOR EACH ROW EXECUTE FUNCTION public.set_churn_alerts_updated_at();

-- ─────────── 4. RLS ───────────
ALTER TABLE public.churn_alerts ENABLE ROW LEVEL SECURITY;

-- Staff/admin lê tudo. Edge functions via service_role bypassam RLS.
DO $$ BEGIN
  CREATE POLICY churn_alerts_select_staff
    ON public.churn_alerts
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'manager', 'reception')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Treinador vê alertas de churn dos alunos dele.
DO $$ BEGIN
  CREATE POLICY churn_alerts_select_trainer
    ON public.churn_alerts
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.trainers t
        WHERE t.profile_id = auth.uid()
          AND t.id = churn_alerts.trainer_id
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────── 5. Policies seeds (config do agente) ───────────
-- Janelas seedadas conservadoras pro estado ATUAL de dados (~3 semanas
-- de histórico). Conforme o histórico cresce, subir `recent_weeks` pra
-- ~4 e confiar no `full`. Os thresholds são fração 0-1.
INSERT INTO public.policies (key, value, description)
VALUES
  ('churn_agent.mode',
    '"shadow"'::jsonb,
    'Modo do detector de churn: "shadow" (só persiste churn_alerts) ou "live" (futuro: notifica treinadores).'),

  ('churn_agent.recent_weeks',
    '1'::jsonb,
    'Quantas semanas completas mais recentes formam a janela "recente". Subir pra ~4 quando houver 10+ semanas de histórico.'),

  ('churn_agent.baseline_weeks',
    '8'::jsonb,
    'Quantas semanas completas (antes da recente) formam a baseline-alvo. O detector usa o que tiver disponível.'),

  ('churn_agent.min_baseline_weeks',
    '4'::jsonb,
    'Abaixo desse nº de semanas de baseline, o resultado é "provisional" e exige queda maior pra disparar.'),

  ('churn_agent.drop_threshold_pct',
    '0.4'::jsonb,
    'Queda mínima na média semanal (0-1) pra disparar churn quando confidence = full.'),

  ('churn_agent.provisional_drop_threshold_pct',
    '0.6'::jsonb,
    'Queda mínima na média semanal (0-1) pra disparar churn quando confidence = provisional.'),

  ('churn_agent.lookback_days',
    '90'::jsonb,
    'Quantos dias pra trás varrer attendance_events pra montar o histórico semanal por aluno.'),

  ('churn_agent.timezone',
    '"America/Sao_Paulo"'::jsonb,
    'Timezone usado pra derivar a data "hoje" que fecha a janela de dados.')
ON CONFLICT (key) DO NOTHING;

-- =============================================================
-- Cron do detector de churn → churn_alerts.
-- =============================================================
-- Agenda o job `attendance-churn-weekly-mon8h` que dispara
-- POST /detect-churn-risk toda SEGUNDA às 08h SP (= 11:00 UTC).
--
-- Cadência SEMANAL (não diária) de propósito: churn é sinal lento —
-- comparação de médias semanais. Rodar todo dia só geraria ruído e
-- gastaria execução à toa; uma rodada por semana, no início da semana,
-- é o ritmo certo pra revisar quem está rareando.
--
-- Auth do disparo: header `x-attendance-agent-cron-secret` lido da
-- tabela `attendance_agent_runtime_config` em runtime pela function
-- (`hasValidAttendanceCronSecret`). Esta migration NÃO contém o
-- secret — só agenda o job.
--
-- Nome prefixado `attendance-` pra cair no filtro de
-- `attendance_cron_jobnames()`. NÃO está em `EXPECTED_CRONS` do
-- validador pré-live do agente de faltas — são agentes distintos, e o
-- validador só reclama de cron ESPERADO ausente, nunca de cron extra.
--
-- Idempotente: remove job anterior com mesmo nome antes de recriar.
-- =============================================================

-- 1) Idempotência.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'attendance-churn-weekly-mon8h';

-- 2) Detector de churn, segunda 08h SP (= 11:00 UTC).
SELECT cron.schedule(
  'attendance-churn-weekly-mon8h',
  '0 11 * * 1',
  $job$
  SELECT net.http_post(
    url := 'https://hcfzqeutssngprldtymo.functions.supabase.co/detect-churn-risk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-attendance-agent-cron-secret',
      COALESCE(
        (SELECT value FROM public.attendance_agent_runtime_config
          WHERE key = 'cron_secret'),
        ''
      )
    ),
    body := jsonb_build_object('dryRun', false)
  );
  $job$
);