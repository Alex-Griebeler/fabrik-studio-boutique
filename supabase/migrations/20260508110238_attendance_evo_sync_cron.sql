-- =============================================================
-- Cron do sync EVO → attendance_events (Fase 2 — dry-run inicial).
-- =============================================================
-- Adiciona o job `attendance-evo-sync-21h40` que dispara
-- POST /sync-evo-attendance com body `{"dryRun": true}` todo dia
-- às 21h40 SP (= 00:40 UTC), antes do detector das 22h SP.
--
-- Auth do disparo: header `x-attendance-agent-cron-secret` lido da
-- tabela `attendance_agent_runtime_config` em runtime pela function
-- (`hasValidAttendanceCronSecret`). Esta migration NÃO contém o
-- secret — só agenda o job.
--
-- Idempotente: remove jobs anteriores com mesmo nome antes de
-- recriar, e usa unschedule por jobid (compat).
-- =============================================================

-- 1) Idempotência: remove cron anterior com mesmo nome se existir.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'attendance-evo-sync-21h40';

-- 2) Sync EVO em dry-run, 21h40 SP (= 00:40 UTC), todo dia.
--    Executa ANTES do detector (que roda 22h SP / 01:00 UTC).
SELECT cron.schedule(
  'attendance-evo-sync-21h40',
  '40 0 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://hcfzqeutssngprldtymo.functions.supabase.co/sync-evo-attendance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-attendance-agent-cron-secret',
      COALESCE(
        (SELECT value FROM public.attendance_agent_runtime_config
          WHERE key = 'cron_secret'),
        ''
      )
    ),
    body := jsonb_build_object('dryRun', true)
  );
  $job$
);
