-- =============================================================
-- Fix: cron do sync EVO estava preso em dry-run.
-- =============================================================
-- A migration `20260508110238_attendance_evo_sync_cron.sql` agendou
-- `attendance-evo-sync-21h40` com `body := jsonb_build_object('dryRun', true)`
-- hardcoded. Resultado: de 08 a 13/05 o cron rodou todo dia, a chamada
-- HTTP saiu com sucesso, mas a function nunca persistiu nada em
-- `attendance_events` — sempre dry-run. Só o dia 07/05 (sync manual)
-- ficou na tabela.
--
-- Este fix reagenda o MESMO job com `dryRun := false`.
--
-- Por que é seguro mesmo com o agente em modo shadow: o sync só
-- POPULA `attendance_events` (coleta de dados, read-only do ponto de
-- vista de efeitos colaterais). NÃO manda WhatsApp. A distinção
-- shadow/live vale pros ALERTAS (detector/escalator), não pra coleta
-- de presença — que precisa de dados reais pra qualquer coisa
-- funcionar.
--
-- Idempotente: unschedule por jobid antes de recriar.
-- =============================================================

-- 1) Idempotência: remove o job anterior (o que estava em dry-run).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'attendance-evo-sync-21h40';

-- 2) Reagenda igual ao original, mas com `dryRun := false`.
--    Mesmo horário (40 0 * * * = 21h40 SP), mesma auth via
--    `cron_secret` lido de `attendance_agent_runtime_config`.
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
    body := jsonb_build_object('dryRun', false)
  );
  $job$
);
