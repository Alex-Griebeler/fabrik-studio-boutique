-- Crons do agente de detecção de faltas (versionado, sem ALTER DATABASE).
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
      'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), '')
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
      'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), '')
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
      'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);