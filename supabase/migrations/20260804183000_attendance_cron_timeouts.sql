-- attendance_cron_timeouts — sobe o timeout do pg_net nos 2 crons de atendimento
-- que comprovadamente estouram os 5000 ms default:
--   * attendance-escalate-30min  → 30000 ms (10/12 execucoes de 04/08 com
--     "Timeout of 5000 ms" em net._http_response; a funcao completa server-side,
--     o dano e observabilidade)
--   * attendance-channel-healthcheck-7h-sp → 45000 ms (a funcao aguarda 15 s por
--     design — STATUS_CHECK_DELAY_MS — antes de consultar a Twilio; o default
--     de 5000 ms estoura SEMPRE)
-- Mecanismo: cron.alter_job in-place (preserva jobid/dono/schedule/active),
-- guarda de md5 do comando vigente em 04/08 18:31 UTC, idempotencia estrita
-- (valor divergente aborta) e pos-verificacao campo a campo.
-- Auditoria: Codex GO em 04/08 (alter_job em vez de unschedule+schedule,
-- valores 30000/45000, aplicacao fora da virada do minuto).
-- Divida registrada: escalate processa ate 500 alertas sequencialmente com
-- chamada externa por candidato — timeout maior nao corrige runtime linear;
-- batching/limite fica para a onda do motor de atendimento.

DO $mig$
DECLARE
  target record;
  pre record;
  post record;
  rewritten text;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('attendance-escalate-30min', '1230751a696004a8735f7bac65ef74a1', 30000),
      ('attendance-channel-healthcheck-7h-sp', '50c1449a3b9436388b55b1471b242c4d', 45000)
    ) AS t(jobname, cmd_md5, timeout_ms)
  LOOP
    SELECT jobid, schedule, command, username, database, active, nodename, nodeport
      INTO STRICT pre FROM cron.job WHERE jobname = target.jobname;

    IF NOT pre.active THEN
      RAISE EXCEPTION 'timeout-fix: job % inativo', target.jobname;
    END IF;

    IF pre.command ~ format('timeout_milliseconds\s*:=\s*%s\M', target.timeout_ms) THEN
      RAISE NOTICE 'timeout-fix: job % ja no valor desejado; pulando', target.jobname;
      CONTINUE;
    ELSIF pre.command ~* 'timeout_milliseconds' THEN
      RAISE EXCEPTION 'timeout-fix: job % tem timeout divergente; intervencao manual', target.jobname;
    END IF;

    IF md5(pre.command) <> target.cmd_md5 THEN
      RAISE EXCEPTION 'timeout-fix: comando do job % mudou desde a auditoria (md5 atual %)', target.jobname, md5(pre.command);
    END IF;

    rewritten := replace(
      pre.command,
      $$body := '{}'::jsonb$$,
      format($$body := '{}'::jsonb,
    timeout_milliseconds := %s$$, target.timeout_ms)
    );

    IF rewritten = pre.command THEN
      RAISE EXCEPTION 'timeout-fix: replace nao alterou o job %', target.jobname;
    END IF;

    PERFORM cron.alter_job(job_id := pre.jobid, command := rewritten);

    SELECT jobid, schedule, command, username, database, active, nodename, nodeport
      INTO STRICT post FROM cron.job WHERE jobname = target.jobname;

    IF post.jobid <> pre.jobid OR post.schedule <> pre.schedule
       OR post.username <> pre.username OR post.database <> pre.database
       OR post.active <> pre.active OR post.nodename <> pre.nodename
       OR post.nodeport <> pre.nodeport OR post.command <> rewritten THEN
      RAISE EXCEPTION 'timeout-fix: pos-verificacao falhou no job %', target.jobname;
    END IF;
  END LOOP;
END
$mig$;
