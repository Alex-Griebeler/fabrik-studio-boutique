-- Runtime auth for attendance-agent cron jobs.
--
-- This avoids storing the Supabase service_role key in Postgres settings.
-- The secret is generated inside the database, never committed, and only
-- sent from pg_cron to the attendance Edge Functions.

CREATE TABLE IF NOT EXISTS public.attendance_agent_runtime_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_agent_runtime_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.attendance_agent_runtime_config
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.attendance_agent_runtime_config
  TO service_role;

INSERT INTO public.attendance_agent_runtime_config (key, value, description)
VALUES (
  'cron_secret',
  lower(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  'Segredo interno usado pelo pg_cron para autenticar chamadas do agente de faltas.'
)
ON CONFLICT (key) DO NOTHING;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'attendance-detect-22h',
  'attendance-send-pending-9h',
  'attendance-escalate-30min'
);

SELECT cron.schedule(
  'attendance-detect-22h',
  '0 1 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://hcfzqeutssngprldtymo.functions.supabase.co/detect-attendance-risk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-attendance-agent-cron-secret',
      COALESCE((SELECT value FROM public.attendance_agent_runtime_config WHERE key = 'cron_secret'), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);

SELECT cron.schedule(
  'attendance-send-pending-9h',
  '0 12 * * 1-5',
  $job$
  SELECT net.http_post(
    url := 'https://hcfzqeutssngprldtymo.functions.supabase.co/detect-attendance-risk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-attendance-agent-cron-secret',
      COALESCE((SELECT value FROM public.attendance_agent_runtime_config WHERE key = 'cron_secret'), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);

SELECT cron.schedule(
  'attendance-escalate-30min',
  '*/30 12-21 * * 1-5',
  $job$
  SELECT net.http_post(
    url := 'https://hcfzqeutssngprldtymo.functions.supabase.co/escalate-attendance-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-attendance-agent-cron-secret',
      COALESCE((SELECT value FROM public.attendance_agent_runtime_config WHERE key = 'cron_secret'), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);
