BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, auth;

SELECT plan(31);

-- ─── Tabela de runtime config ────────────────────────────────────

SELECT has_table(
  'public',
  'finance_runtime_config',
  'finance runtime config table exists'
);

SELECT is(
  (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.finance_runtime_config'::regclass
  ),
  true,
  'finance runtime config has RLS enabled'
);

-- RLS ligada + zero policies => nem anon nem authenticated leem, mesmo que
-- algum GRANT futuro escape.
SELECT is(
  (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'finance_runtime_config'
  ),
  0::bigint,
  'finance runtime config exposes no RLS policy to browser roles'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.finance_runtime_config', 'SELECT'),
  'anon cannot read the finance cron secret'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.finance_runtime_config', 'INSERT'),
  'anon cannot seed a finance cron secret'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.finance_runtime_config', 'SELECT'),
  'authenticated cannot read the finance cron secret'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.finance_runtime_config', 'UPDATE'),
  'authenticated cannot rotate the finance cron secret'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.finance_runtime_config', 'INSERT'),
  'authenticated cannot seed a finance cron secret'
);

SELECT ok(
  has_table_privilege('service_role', 'public.finance_runtime_config', 'SELECT'),
  'service role can validate the finance cron secret server-side'
);

-- ─── Segredo ─────────────────────────────────────────────────────

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_runtime_config
    WHERE key = 'cron_secret'
  ),
  1::bigint,
  'migration creates exactly one finance cron secret'
);

SELECT ok(
  (
    SELECT value ~ '^[0-9a-f]{64}$'
    FROM public.finance_runtime_config
    WHERE key = 'cron_secret'
  ),
  'finance cron secret has the expected high-entropy format'
);

-- ─── Jobs financeiros no pg_cron ───────────────────────────────────
--
-- Todas as asserções abaixo são contagens de VIOLAÇÃO, comparadas com zero.
-- Isso as torna tolerantes a "nenhum job financeiro existe" (o caso em que a
-- migration deliberadamente não agenda nada) e, ao mesmo tempo, estritas
-- quando algum job existe: qualquer job financeiro que tenha escapado do
-- reagendamento aparece aqui como violação.

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE (
        command LIKE '%/daily-finance-cron%'
        OR command LIKE '%/generate-monthly-invoices%'
        OR command LIKE '%/calculate-invoice-penalties%'
      )
      AND command NOT LIKE '%public.finance_runtime_config%'
  ),
  0::bigint,
  'every finance cron job resolves its secret from finance_runtime_config'
);

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE (
        command LIKE '%/daily-finance-cron%'
        OR command LIKE '%/generate-monthly-invoices%'
        OR command LIKE '%/calculate-invoice-penalties%'
      )
      AND command NOT LIKE '%COALESCE%'
  ),
  0::bigint,
  'every finance cron job builds the header with the COALESCE lookup'
);

-- Um literal de 64 hex no comando significaria segredo materializado em
-- cron.job — exatamente o que a migration existe para evitar.
SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE (
        command LIKE '%/daily-finance-cron%'
        OR command LIKE '%/generate-monthly-invoices%'
        OR command LIKE '%/calculate-invoice-penalties%'
      )
      AND command ~ '[0-9a-f]{64}'
  ),
  0::bigint,
  'no finance cron job carries a literal 64-hex secret'
);

-- Reauditoria do legado: job antigo mandava Authorization (JWT anônimo ou
-- service_role) no header. Depois do reagendamento nenhum deve restar.
SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE (
        command LIKE '%/daily-finance-cron%'
        OR command LIKE '%/generate-monthly-invoices%'
        OR command LIKE '%/calculate-invoice-penalties%'
      )
      AND command ILIKE '%authorization%'
  ),
  0::bigint,
  'no finance cron job still sends an Authorization header'
);

-- ─── Contexto de execucao preservado (A1.1) ──────────────────────────
--
-- A migration recria os jobs na mesma sessao e aborta (passagem 1c) se
-- encontrar job inativo ou de outro usuario/database. No estado final,
-- nenhum job financeiro pode ter mudado de contexto.

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE (
        command LIKE '%/daily-finance-cron%'
        OR command LIKE '%/generate-monthly-invoices%'
        OR command LIKE '%/calculate-invoice-penalties%'
      )
      AND NOT active
  ),
  0::bigint,
  'every finance cron job remains active after the rewrite'
);

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE (
        command LIKE '%/daily-finance-cron%'
        OR command LIKE '%/generate-monthly-invoices%'
        OR command LIKE '%/calculate-invoice-penalties%'
      )
      AND username <> current_user
  ),
  0::bigint,
  'every finance cron job keeps the executing username'
);

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE (
        command LIKE '%/daily-finance-cron%'
        OR command LIKE '%/generate-monthly-invoices%'
        OR command LIKE '%/calculate-invoice-penalties%'
      )
      AND database <> current_database()
  ),
  0::bigint,
  'every finance cron job keeps the target database'
);

-- ─── Regra suportada pela migration ──────────────────────────────────
--
-- A migration só reescreve job com `net.http_post` e headers em literal SQL
-- convertido para jsonb, e aborta antes do primeiro unschedule se encontrar
-- outra forma. O body pode ser dinamico porque ele nao e reconstituido.
-- As duas asserções abaixo são o espelho dessa regra no estado final: se
-- passarem, todo job financeiro existente está dentro do que a migration
-- sabe manter fiel.

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE (
        command LIKE '%/daily-finance-cron%'
        OR command LIKE '%/generate-monthly-invoices%'
        OR command LIKE '%/calculate-invoice-penalties%'
      )
      AND command NOT ILIKE '%net.http_post%'
  ),
  0::bigint,
  'every finance cron job is invoked through net.http_post'
);

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE (
        command LIKE '%/daily-finance-cron%'
        OR command LIKE '%/generate-monthly-invoices%'
        OR command LIKE '%/calculate-invoice-penalties%'
      )
      AND command !~* $re$body\s*:=$re$
  ),
  0::bigint,
  'every finance cron job retains its body argument'
);

-- Vale para QUALQUER job, não só os financeiros: o segredo desta tabela não
-- pode aparecer materializado em nenhum comando agendado.
SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE command LIKE
      '%' || (
        SELECT value FROM public.finance_runtime_config WHERE key = 'cron_secret'
      ) || '%'
  ),
  0::bigint,
  'the finance cron secret is never materialized into any cron command'
);

-- ─── Fidelidade e idempotencia do reagendamento ───────────────────────
--
-- O fixture aplica esta migration duas vezes. Estas assercoes provam que a
-- segunda execucao nao duplica jobs e que nome, schedule e body sobrevivem.

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE command LIKE '%/daily-finance-cron%'
       OR command LIKE '%/generate-monthly-invoices%'
       OR command LIKE '%/calculate-invoice-penalties%'
  ),
  3::bigint,
  'rerunning the migration leaves exactly the three original finance jobs'
);

SELECT is(
  (SELECT count(*) FROM cron.job WHERE jobname = 'fixture-daily-finance'),
  1::bigint,
  'the named daily finance job is not duplicated'
);

SELECT is(
  (SELECT count(*) FROM cron.job WHERE jobname = 'fixture-monthly-invoices'),
  1::bigint,
  'the named monthly invoice job is not duplicated'
);

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname LIKE 'finance-calculate-invoice-penalties-%'
      AND command LIKE '%/calculate-invoice-penalties%'
  ),
  1::bigint,
  'the unnamed penalty job receives one deterministic collision-safe name'
);

SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'fixture-daily-finance'),
  '40 21 * * *',
  'the daily finance schedule is preserved'
);

SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'fixture-monthly-invoices'),
  '5 8 1 * *',
  'the monthly invoice schedule is preserved'
);

SELECT is(
  (
    SELECT schedule
    FROM cron.job
    WHERE jobname LIKE 'finance-calculate-invoice-penalties-%'
  ),
  '10 2 * * *',
  'the unnamed penalty schedule is preserved'
);

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'fixture-daily-finance'
      AND command LIKE '%concat(''%"source":"fixture"%triggered_at%''%'
      AND command LIKE '%now()%'
      AND command LIKE '%"dryRun":false%'
  ),
  1::bigint,
  'the dynamic daily finance body is preserved'
);

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'fixture-monthly-invoices'
      AND command LIKE '%concat(''%"source":"fixture"%triggered_at%''%'
      AND command LIKE '%now()%'
      AND command LIKE '%"validateOnly":true%'
  ),
  1::bigint,
  'the dynamic monthly invoice body is preserved'
);

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname LIKE 'finance-calculate-invoice-penalties-%'
      AND command LIKE '%concat(''%"source":"fixture"%triggered_at%''%'
      AND command LIKE '%now()%'
      AND command LIKE '%"apply":false%'
  ),
  1::bigint,
  'the dynamic penalty body is preserved'
);

SELECT * FROM finish();
ROLLBACK;
