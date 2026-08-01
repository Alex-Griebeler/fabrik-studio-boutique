BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, auth;

SELECT plan(22);

SELECT has_table(
  'public',
  'nurturing_runtime_config',
  'runtime config table exists'
);

SELECT is(
  (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.nurturing_runtime_config'::regclass
  ),
  true,
  'runtime config has RLS enabled'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'nurturing_runtime_config'
  ),
  0::bigint,
  'runtime config exposes no RLS policy to browser roles'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.nurturing_runtime_config', 'SELECT'),
  'anon cannot read the cron secret'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.nurturing_runtime_config', 'SELECT'),
  'authenticated cannot read the cron secret'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.nurturing_runtime_config', 'UPDATE'),
  'authenticated cannot rotate the cron secret'
);

SELECT ok(
  has_table_privilege('service_role', 'public.nurturing_runtime_config', 'SELECT'),
  'service role can validate the cron secret server-side'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.nurturing_runtime_config
    WHERE key = 'cron_secret'
  ),
  1::bigint,
  'migration creates exactly one cron secret'
);

SELECT ok(
  (
    SELECT value ~ '^[0-9a-f]{64}$'
    FROM public.nurturing_runtime_config
    WHERE key = 'cron_secret'
  ),
  'cron secret has the expected high-entropy format'
);

SELECT has_column(
  'public', 'sequence_step_events', 'idempotency_key',
  'step events have an idempotency key'
);
SELECT has_column(
  'public', 'sequence_step_events', 'request_id',
  'step events carry the correlation request id'
);
SELECT has_column(
  'public', 'sequence_step_events', 'provider_message_id',
  'step events retain the provider message id'
);
SELECT has_column(
  'public', 'sequence_step_events', 'error',
  'step events retain a bounded operational error'
);
SELECT has_column(
  'public', 'sequence_step_events', 'updated_at',
  'step events record lifecycle updates'
);

SELECT has_index(
  'public',
  'sequence_step_events',
  'sequence_step_events_idempotency_key_uidx',
  'idempotency index exists'
);

SELECT is(
  (
    SELECT indisunique
    FROM pg_index
    WHERE indexrelid =
      'public.sequence_step_events_idempotency_key_uidx'::regclass
  ),
  true,
  'idempotency index is unique'
);

SELECT ok(
  (
    SELECT indexprs IS NULL AND indpred IS NOT NULL
    FROM pg_index
    WHERE indexrelid =
      'public.sequence_step_events_idempotency_key_uidx'::regclass
  ),
  'idempotency index is partial and covers a plain column'
);

SELECT has_index(
  'public',
  'sequence_step_events',
  'sequence_step_events_pending_monitor_idx',
  'processing and failed events have a monitoring index'
);

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'execute-nurturing-steps-every-5min'
  ),
  0::bigint,
  'unsafe nurturing cron is removed and not recreated'
);

SELECT ok(
  has_table_privilege('service_role', 'public.sequence_step_events', 'INSERT'),
  'service role can claim an idempotency event'
);

SELECT ok(
  has_table_privilege('service_role', 'public.sequence_step_events', 'UPDATE'),
  'service role can finalize an idempotency event'
);

SELECT col_not_null(
  'public',
  'sequence_step_events',
  'updated_at',
  'event update timestamp cannot be null'
);

SELECT * FROM finish();
ROLLBACK;
