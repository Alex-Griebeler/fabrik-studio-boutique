-- =============================================================
-- Crons do agente de detecção de faltas — versionados.
-- =============================================================
-- IMPORTANTE: este arquivo NÃO contém service_role_key, JWT, token
-- ou qualquer segredo. Os jobs leem o service_role_key em runtime via
-- `current_setting('app.settings.service_role_key', true)`.
--
-- Pré-requisito operacional (rodar UMA VEZ no SQL Editor, fora do
-- versionamento):
--
--   ALTER DATABASE postgres
--     SET app.settings.service_role_key = '<<SERVICE_ROLE_KEY>>';
--
-- Sem essa setting, os jobs ainda rodam, mas o header Authorization
-- vira 'Bearer ' (vazio) e a chamada à edge function retorna 401 —
-- nenhum segredo vaza, só a mensagem não sai.
-- =============================================================

-- 1) URL base das edge functions (não é segredo) — versionada.
ALTER DATABASE postgres
  SET app.settings.functions_url =
    'https://hcfzqeutssngprldtymo.functions.supabase.co';

-- 2) Idempotência: remove crons anteriores se existirem (compat por jobid).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'attendance-detect-22h',
  'attendance-send-pending-9h',
  'attendance-escalate-30min'
);

-- 3) Detecção diária às 22h America/Sao_Paulo (= 01:00 UTC).
SELECT cron.schedule(
  'attendance-detect-22h',
  '0 1 * * *',
  $job$
  SELECT net.http_post(
    url := current_setting('app.settings.functions_url') || '/detect-attendance-risk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- 4) Retry/envio de pendentes às 9h America/Sao_Paulo (= 12:00 UTC), seg-sex.
--    Reutiliza o detector — sendPendingAlerts processa alertas abertos
--    com notified_at IS NULL quando dentro da janela.
SELECT cron.schedule(
  'attendance-send-pending-9h',
  '0 12 * * 1-5',
  $job$
  SELECT net.http_post(
    url := current_setting('app.settings.functions_url') || '/detect-attendance-risk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- 5) Escalação a cada 30min em horário comercial UTC (= 9-18 SP), seg-sex.
SELECT cron.schedule(
  'attendance-escalate-30min',
  '*/30 12-21 * * 1-5',
  $job$
  SELECT net.http_post(
    url := current_setting('app.settings.functions_url') || '/escalate-attendance-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);
