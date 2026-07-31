-- P0-4a: conter o executor de nurturing antes de qualquer reativacao.
--
-- Este PR deliberadamente NAO recria o cron. A reativacao sera uma migration
-- separada, somente depois de tres chamadas dry-run autenticadas com HTTP 2xx.
-- O rollback seguro e manter o job desabilitado; nunca restaurar o JWT anonimo.

CREATE TABLE IF NOT EXISTS public.nurturing_runtime_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nurturing_runtime_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.nurturing_runtime_config FROM PUBLIC, anon, authenticated;

INSERT INTO public.nurturing_runtime_config (key, value, description)
VALUES (
  'cron_secret',
  lower(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  'Segredo interno dedicado ao executor de nurturing. Nao expor no cliente.'
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.sequence_step_events
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS sequence_step_events_idempotency_key_uidx
  ON public.sequence_step_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS sequence_step_events_pending_monitor_idx
  ON public.sequence_step_events (event_type, updated_at)
  WHERE event_type IN ('processing', 'failed');

-- Contencao hora-zero: o job observado em producao usa JWT anonimo literal e
-- falha continuamente. Remocao por jobid e a API suportada pelo pg_cron.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'execute-nurturing-steps-every-5min';
