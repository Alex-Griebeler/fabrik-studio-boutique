BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(30);

SELECT is(
  (
    SELECT n.nspname
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pgcrypto'
  ),
  'extensions',
  'pgcrypto is installed in the schema required by the hardened functions'
);

SELECT has_table(
  'public',
  'anamnese_link_tokens',
  'token table exists'
);

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.anamnese_link_tokens'::regclass),
  true,
  'token table has RLS enabled'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.anamnese_link_tokens', 'SELECT'),
  'anon cannot read token hashes'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.anamnese_link_tokens', 'SELECT'),
  'authenticated users cannot read token hashes'
);

SELECT function_privs_are(
  'public',
  'calculate_monthly_kpis',
  ARRAY['date'],
  'authenticated',
  ARRAY['EXECUTE'],
  'authenticated can invoke KPI RPC, which enforces admin internally'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.calculate_monthly_kpis(date)', 'EXECUTE'),
  'anon cannot invoke KPI RPC'
);

SELECT function_privs_are(
  'public',
  'mark_overdue_invoices',
  ARRAY[]::text[],
  'authenticated',
  ARRAY['EXECUTE'],
  'authenticated can invoke overdue RPC, which enforces admin internally'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.mark_overdue_invoices()', 'EXECUTE'),
  'anon cannot invoke overdue RPC'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.issue_anamnese_link(uuid,interval)',
    'EXECUTE'
  ),
  'authenticated staff can invoke link issuer'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.issue_anamnese_link(uuid,interval)',
    'EXECUTE'
  ),
  'anon cannot invoke link issuer'
);

SELECT ok(
  has_function_privilege(
    'anon',
    'public.update_lead_anamnese(uuid,text,jsonb,text,text,text)',
    'EXECUTE'
  ),
  'anon can submit through the token-bound RPC'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.update_lead_anamnese(uuid,text,jsonb,text,text,text)',
    'EXECUTE'
  ),
  'authenticated staff can submit only through the same token-bound RPC'
);

SELECT ok(
  to_regprocedure('public.update_lead_anamnese(uuid,jsonb,text,text,text)') IS NULL,
  'the vulnerable lead-id-only overload no longer exists'
);

SELECT is(
  (
    SELECT proconfig
    FROM pg_proc
    WHERE oid = 'public.issue_anamnese_link(uuid,interval)'::regprocedure
  ),
  ARRAY['search_path=""']::text[],
  'link issuer has an empty search_path'
);

SELECT is(
  (
    SELECT proconfig
    FROM pg_proc
    WHERE oid = 'public.update_lead_anamnese(uuid,text,jsonb,text,text,text)'::regprocedure
  ),
  ARRAY['search_path=""']::text[],
  'anamnese updater has an empty search_path'
);

-- Runtime authorization and token-lifecycle tests. All fixtures are rolled
-- back at the end of the file.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    'f0000000-0000-0000-0000-000000000001',
    'p0-student@example.invalid',
    '{"full_name":"P0 student"}'::jsonb
  ),
  (
    'f0000000-0000-0000-0000-000000000002',
    'p0-manager@example.invalid',
    '{"full_name":"P0 manager"}'::jsonb
  );

DELETE FROM public.user_roles
WHERE user_id IN (
  'f0000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000002'
);

INSERT INTO public.user_roles (user_id, role)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'student'),
  ('f0000000-0000-0000-0000-000000000002', 'manager');

INSERT INTO public.leads (id, name)
VALUES ('f1000000-0000-0000-0000-000000000001', 'P0 lead');

CREATE TEMP TABLE p0_anamnese_tokens (
  kind text PRIMARY KEY,
  token text NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE p0_anamnese_tokens
  TO authenticated, anon;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$SELECT public.calculate_monthly_kpis(CURRENT_DATE)$$,
  '42501',
  'Not authorized',
  'student cannot calculate global KPIs'
);

SELECT throws_ok(
  $$SELECT public.mark_overdue_invoices()$$,
  '42501',
  'Not authorized',
  'student cannot mark global invoices overdue'
);

SELECT throws_ok(
  $$SELECT public.issue_anamnese_link('f1000000-0000-0000-0000-000000000001')$$,
  '42501',
  'Not authorized',
  'student cannot issue anamnese links'
);

SET LOCAL request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000002';

SELECT lives_ok(
  $$SELECT public.calculate_monthly_kpis(CURRENT_DATE)$$,
  'manager can calculate global KPIs'
);

SELECT lives_ok(
  $$SELECT public.mark_overdue_invoices()$$,
  'manager can mark global invoices overdue'
);

INSERT INTO p0_anamnese_tokens (kind, token)
SELECT
  'anon_valid',
  public.issue_anamnese_link('f1000000-0000-0000-0000-000000000001');

SELECT is(
  (SELECT length(token) FROM p0_anamnese_tokens WHERE kind = 'anon_valid'),
  64,
  'issued token contains 256 bits encoded as 64 hex characters'
);

RESET ROLE;
SET LOCAL ROLE anon;

WITH response AS (
  SELECT public.update_lead_anamnese(
    'f1000000-0000-0000-0000-000000000001',
    (SELECT token FROM p0_anamnese_tokens WHERE kind = 'anon_valid'),
    '{
      "dados_pessoais":{"idade":"30","profissao":"Teste","unknown":"remove"},
      "perfil":{"onde_treina":"Studio"},
      "treino":{"objetivos":["Saúde"]},
      "parq":{"problema_cardiaco":false},
      "unknown_group":{"value":"remove"}
    }'::jsonb,
    'P0 lead updated',
    '11999999999',
    'p0-lead@example.invalid'
  ) AS value
)
SELECT ok(
  (value->>'ok')::boolean,
  'anon can submit a valid single-use token'
)
FROM response;

WITH response AS (
  SELECT public.update_lead_anamnese(
    'f1000000-0000-0000-0000-000000000001',
    (SELECT token FROM p0_anamnese_tokens WHERE kind = 'anon_valid'),
    '{"dados_pessoais":{},"perfil":{},"treino":{},"parq":{}}'::jsonb
  ) AS value
)
SELECT ok(
  NOT (value->>'ok')::boolean,
  'the same token cannot be used twice'
)
FROM response;

RESET ROLE;

SELECT ok(
  (
    SELECT qualification_details->'dados_pessoais'->>'idade' = '30'
      AND NOT (qualification_details->'dados_pessoais' ? 'unknown')
      AND NOT (qualification_details ? 'unknown_group')
    FROM public.leads
    WHERE id = 'f1000000-0000-0000-0000-000000000001'
  ),
  'payload allowlist preserves expected fields and strips unknown fields'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000002';

INSERT INTO p0_anamnese_tokens (kind, token)
SELECT
  'authenticated_valid',
  public.issue_anamnese_link('f1000000-0000-0000-0000-000000000001');

WITH response AS (
  SELECT public.update_lead_anamnese(
    'f1000000-0000-0000-0000-000000000001',
    (SELECT token FROM p0_anamnese_tokens WHERE kind = 'authenticated_valid'),
    '{"dados_pessoais":{},"perfil":{},"treino":{},"parq":{}}'::jsonb
  ) AS value
)
SELECT ok(
  (value->>'ok')::boolean,
  'authenticated staff can submit the same token-bound flow'
)
FROM response;

INSERT INTO p0_anamnese_tokens (kind, token)
SELECT
  'expired',
  public.issue_anamnese_link('f1000000-0000-0000-0000-000000000001');

RESET ROLE;

UPDATE public.anamnese_link_tokens
SET expires_at = now() - interval '1 minute'
WHERE token_hash = extensions.digest(
  (SELECT token FROM p0_anamnese_tokens WHERE kind = 'expired'),
  'sha256'
);

SET LOCAL ROLE anon;

WITH response AS (
  SELECT public.update_lead_anamnese(
    'f1000000-0000-0000-0000-000000000001',
    (SELECT token FROM p0_anamnese_tokens WHERE kind = 'expired'),
    '{"dados_pessoais":{},"perfil":{},"treino":{},"parq":{}}'::jsonb
  ) AS value
)
SELECT ok(
  NOT (value->>'ok')::boolean,
  'expired token is rejected'
)
FROM response;

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000002';

INSERT INTO p0_anamnese_tokens (kind, token)
SELECT
  'rate_limited',
  public.issue_anamnese_link('f1000000-0000-0000-0000-000000000001');

RESET ROLE;
SET LOCAL ROLE anon;

WITH attempts AS MATERIALIZED (
  SELECT public.update_lead_anamnese(
    'f1000000-0000-0000-0000-000000000001',
    repeat(substr('abcdef', attempt, 1), 64),
    '{"dados_pessoais":{},"perfil":{},"treino":{},"parq":{}}'::jsonb
  )
  FROM generate_series(1, 5) AS attempt
)
SELECT is(
  (SELECT count(*) FROM attempts),
  5::bigint,
  'five invalid attempts are recorded'
);

WITH response AS (
  SELECT public.update_lead_anamnese(
    'f1000000-0000-0000-0000-000000000001',
    (SELECT token FROM p0_anamnese_tokens WHERE kind = 'rate_limited'),
    '{"dados_pessoais":{},"perfil":{},"treino":{},"parq":{}}'::jsonb
  ) AS value
)
SELECT is(
  value->>'code',
  'rate_limited',
  'correct token is temporarily blocked after five invalid attempts'
)
FROM response;

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000002';

INSERT INTO p0_anamnese_tokens (kind, token)
SELECT
  'invalid_payload',
  public.issue_anamnese_link('f1000000-0000-0000-0000-000000000001');

RESET ROLE;
SET LOCAL ROLE anon;

WITH response AS (
  SELECT public.update_lead_anamnese(
    'f1000000-0000-0000-0000-000000000001',
    (SELECT token FROM p0_anamnese_tokens WHERE kind = 'invalid_payload'),
    '{"dados_pessoais":[],"perfil":{},"treino":{},"parq":{}}'::jsonb
  ) AS value
)
SELECT is(
  value->>'code',
  'invalid_payload',
  'wrong group types are rejected'
)
FROM response;

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
