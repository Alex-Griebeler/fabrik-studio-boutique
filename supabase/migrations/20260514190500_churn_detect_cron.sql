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
