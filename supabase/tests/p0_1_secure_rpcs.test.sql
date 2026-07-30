BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(15);

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
  NOT has_function_privilege(
    'authenticated',
    'public.update_lead_anamnese(uuid,text,jsonb,text,text,text)',
    'EXECUTE'
  ),
  'authenticated clients do not bypass the public token flow'
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

SELECT * FROM finish();

ROLLBACK;
