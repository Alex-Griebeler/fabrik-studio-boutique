-- =============================================================
-- Função helper pra o validador pré-live ler os crons agendados.
-- =============================================================
-- `cron.job` não é exposto via PostgREST. Esta função SECURITY DEFINER
-- devolve apenas os NOMES dos jobs do agente de faltas (jobname LIKE
-- 'attendance-%') — sem expor comandos, secrets ou outros jobs.
--
-- Consumida pela edge function `attendance-prelive-check` via RPC.
-- GRANT EXECUTE só pra service_role.
-- =============================================================

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
