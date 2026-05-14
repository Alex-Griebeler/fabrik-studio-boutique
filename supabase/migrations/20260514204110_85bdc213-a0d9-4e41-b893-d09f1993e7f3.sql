-- 20260512165311 — healthcheck runtime_config + cron
INSERT INTO public.attendance_agent_runtime_config (key, value, description)
VALUES
  ('healthcheck_threshold','2','Falhas consecutivas pra disparar alerta de canal quebrado pro operador.'),
  ('healthcheck_consecutive_failures','0','Contador atual de falhas consecutivas do healthcheck (atualizado pela function).'),
  ('healthcheck_last_ok_at','','Timestamp ISO da última entrega delivered confirmada pelo healthcheck.'),
  ('healthcheck_last_sid','','message_sid da última mensagem teste enviada (debug).'),
  ('healthcheck_last_status','','Outcome da última execução: ok | pending | failed.'),
  ('healthcheck_last_error','','Twilio error_code + error_message da última falha (vazio se OK).')
ON CONFLICT (key) DO NOTHING;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'attendance-channel-healthcheck-7h-sp';

SELECT cron.schedule(
  'attendance-channel-healthcheck-7h-sp',
  '0 10 * * 1-5',
  $job$
  SELECT net.http_post(
    url := 'https://hcfzqeutssngprldtymo.functions.supabase.co/attendance-channel-healthcheck',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-attendance-agent-cron-secret',
      COALESCE((SELECT value FROM public.attendance_agent_runtime_config WHERE key = 'cron_secret'), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- 20260514170931 — RPC attendance_cron_jobnames
CREATE OR REPLACE FUNCTION public.attendance_cron_jobnames()
RETURNS TABLE (jobname text, active boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT j.jobname, j.active
  FROM cron.job j
  WHERE j.jobname LIKE 'attendance-%'
  ORDER BY j.jobname;
$$;

REVOKE ALL ON FUNCTION public.attendance_cron_jobnames() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_cron_jobnames() TO service_role;

NOTIFY pgrst, 'reload schema';