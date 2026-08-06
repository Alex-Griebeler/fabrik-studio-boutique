DO $pausa$
DECLARE
  alvo record;
  pre record;
  post record;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      (16, 'generate-monthly-invoices', '0 3 1 * *'),
      (17, 'calculate-invoice-penalties', '0 4 * * *')
    ) AS t(jobid, jobname, schedule)
  LOOP
    SELECT jobid, jobname, schedule, command, username, database, active
      INTO STRICT pre FROM cron.job WHERE jobid = alvo.jobid;

    IF pre.jobname IS DISTINCT FROM alvo.jobname
       OR pre.schedule IS DISTINCT FROM alvo.schedule THEN
      RAISE EXCEPTION 'pausa: job % divergente (nome=% schedule=%)', alvo.jobid, pre.jobname, pre.schedule;
    END IF;

    IF NOT pre.active THEN
      RAISE NOTICE 'pausa: job % (%) ja estava pausado', alvo.jobid, alvo.jobname;
      CONTINUE;
    END IF;

    PERFORM cron.alter_job(job_id := alvo.jobid, active := false);

    SELECT jobid, jobname, schedule, command, username, database, active
      INTO STRICT post FROM cron.job WHERE jobid = alvo.jobid;

    IF post.active
       OR post.jobname IS DISTINCT FROM pre.jobname
       OR post.schedule IS DISTINCT FROM pre.schedule
       OR post.command IS DISTINCT FROM pre.command
       OR post.username IS DISTINCT FROM pre.username
       OR post.database IS DISTINCT FROM pre.database THEN
      RAISE EXCEPTION 'pausa: pos-verificacao falhou no job %', alvo.jobid;
    END IF;
  END LOOP;

  SELECT jobid, jobname, active INTO STRICT post FROM cron.job WHERE jobid = 18;
  IF post.jobname IS DISTINCT FROM 'daily-finance-cron' THEN
    RAISE EXCEPTION 'pausa: jobid 18 nao e o daily-finance-cron (e %)', post.jobname;
  END IF;
  IF NOT post.active THEN
    RAISE EXCEPTION 'pausa: job 18 (daily-finance-cron) NAO deveria estar pausado';
  END IF;

  RAISE NOTICE 'pausa concluida: 16 e 17 inativos; 18 preservado ativo.';
END
$pausa$;