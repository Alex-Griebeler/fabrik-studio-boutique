-- =============================================================
-- Healthcheck do canal WhatsApp do agente de faltas.
-- =============================================================
-- Adiciona:
--   1. Chaves de runtime_config pra estado e config do healthcheck.
--   2. Cron `attendance-channel-healthcheck-7h-sp` (10:00 UTC,
--      seg-sex) que dispara `attendance-channel-healthcheck`.
--
-- O job envia 1 mensagem WhatsApp teste pro `shadow_phone`,
-- consulta status na Twilio e atualiza contador. Se falhar
-- N vezes seguidas (default 2), notifica Alex via WhatsApp
-- de aviso. Não toca em alertas, mode, fallback, telefones
-- ou outros policies.
--
-- Idempotente: chaves usam ON CONFLICT, cron usa
-- unschedule(jobid) por jobname antes de recriar.
-- =============================================================

-- ─────────── 1. Chaves de runtime_config ───────────
INSERT INTO public.attendance_agent_runtime_config (key, value, description)
VALUES
  ('healthcheck_threshold',
    '2',
    'Falhas consecutivas pra disparar alerta de canal quebrado pro operador.'),
  ('healthcheck_consecutive_failures',
    '0',
    'Contador atual de falhas consecutivas do healthcheck (atualizado pela function).'),
  ('healthcheck_last_ok_at',
    '',
    'Timestamp ISO da última entrega delivered confirmada pelo healthcheck.'),
  ('healthcheck_last_sid',
    '',
    'message_sid da última mensagem teste enviada (debug).'),
  ('healthcheck_last_status',
    '',
    'Outcome da última execução: ok | pending | failed.'),
  ('healthcheck_last_error',
    '',
    'Twilio error_code + error_message da última falha (vazio se OK).')
ON CONFLICT (key) DO NOTHING;

-- ─────────── 2. Cron job ───────────
-- Idempotência: remove jobs anteriores com mesmo nome antes de recriar.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'attendance-channel-healthcheck-7h-sp';

-- 7h America/Sao_Paulo (UTC-3) = 10:00 UTC, segunda a sexta.
SELECT cron.schedule(
  'attendance-channel-healthcheck-7h-sp',
  '0 10 * * 1-5',
  $job$
  SELECT net.http_post(
    url := 'https://hcfzqeutssngprldtymo.functions.supabase.co/attendance-channel-healthcheck',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-attendance-agent-cron-secret',
      COALESCE(
        (SELECT value FROM public.attendance_agent_runtime_config
          WHERE key = 'cron_secret'),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);
