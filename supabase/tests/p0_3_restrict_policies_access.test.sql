BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, auth;

SELECT plan(24);

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.policies'::regclass),
  true,
  'policies keeps RLS enabled'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.policies', 'SELECT'),
  'anon cannot select policies'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.policies', 'UPDATE'),
  'anon cannot update policies'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.policies', 'SELECT'),
  'authenticated reaches SELECT and is then constrained by RLS'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.policies', 'UPDATE'),
  'authenticated reaches UPDATE and is then constrained by RLS'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.policies', 'INSERT'),
  'authenticated cannot insert policies'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.policies', 'DELETE'),
  'authenticated cannot delete policies'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.policies', 'TRUNCATE'),
  'authenticated cannot truncate policies'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.policies', 'REFERENCES'),
  'authenticated has no REFERENCES privilege on policies'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.policies', 'TRIGGER'),
  'authenticated has no TRIGGER privilege on policies'
);

SELECT ok(
  has_table_privilege('service_role', 'public.policies', 'SELECT'),
  'service_role keeps server-side read access'
);

SELECT is(
  (
    SELECT roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'policies'
      AND policyname = 'policies_select_admin'
  ),
  ARRAY['authenticated']::name[],
  'select policy targets only authenticated'
);

SELECT is(
  (
    SELECT roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'policies'
      AND policyname = 'policies_update_admin'
  ),
  ARRAY['authenticated']::name[],
  'update policy targets only authenticated'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'policies'
      AND 'public' = ANY(roles)
  ),
  0::bigint,
  'no policies policy targets PUBLIC'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'policies'
      AND cmd IN ('INSERT', 'DELETE', 'ALL')
  ),
  0::bigint,
  'browser roles have no insert or delete policy'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    'f3000000-0000-0000-0000-000000000001',
    'p0-3-instructor@example.invalid',
    '{"full_name":"P0-3 instructor"}'::jsonb
  ),
  (
    'f3000000-0000-0000-0000-000000000002',
    'p0-3-admin@example.invalid',
    '{"full_name":"P0-3 admin"}'::jsonb
  ),
  (
    'f3000000-0000-0000-0000-000000000003',
    'p0-3-manager@example.invalid',
    '{"full_name":"P0-3 manager"}'::jsonb
  ),
  (
    'f3000000-0000-0000-0000-000000000004',
    'p0-3-reception@example.invalid',
    '{"full_name":"P0-3 reception"}'::jsonb
  ),
  (
    'f3000000-0000-0000-0000-000000000005',
    'p0-3-student@example.invalid',
    '{"full_name":"P0-3 student"}'::jsonb
  );

DELETE FROM public.user_roles
WHERE user_id IN (
  'f3000000-0000-0000-0000-000000000001',
  'f3000000-0000-0000-0000-000000000002',
  'f3000000-0000-0000-0000-000000000003',
  'f3000000-0000-0000-0000-000000000004',
  'f3000000-0000-0000-0000-000000000005'
);

INSERT INTO public.user_roles (user_id, role)
VALUES
  ('f3000000-0000-0000-0000-000000000001', 'instructor'),
  ('f3000000-0000-0000-0000-000000000002', 'admin'),
  ('f3000000-0000-0000-0000-000000000003', 'manager'),
  ('f3000000-0000-0000-0000-000000000004', 'reception'),
  ('f3000000-0000-0000-0000-000000000005', 'student');

INSERT INTO public.policies (key, value, description)
VALUES ('p0_3.test.visible', '1'::jsonb, 'transactional P0-3 fixture');

SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT count(*) FROM public.policies$$,
  '42501',
  'permission denied for table policies',
  'anon receives a privilege error instead of policy data'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f3000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims =
  '{"sub":"f3000000-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT is(
  (SELECT count(*) FROM public.policies WHERE key = 'p0_3.test.visible'),
  0::bigint,
  'operational user cannot read a non-allowlisted policy row'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.policies
    WHERE key = 'personal_cancellation_cutoff_hours'
  ),
  1::bigint,
  'instructor can read the cancellation cutoff required by schedule'
);

WITH changed AS (
  UPDATE public.policies
  SET value = '2'::jsonb
  WHERE key = 'p0_3.test.visible'
  RETURNING 1
)
SELECT is(
  (SELECT count(*) FROM changed),
  0::bigint,
  'operational user updates zero policy rows'
);

SET LOCAL request.jwt.claim.sub = 'f3000000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claims =
  '{"sub":"f3000000-0000-0000-0000-000000000003","role":"authenticated"}';

SELECT is(
  (
    SELECT count(*)
    FROM public.policies
    WHERE key = 'group_cancellation_cutoff_hours'
  ),
  1::bigint,
  'manager can read the cancellation cutoff required by schedule'
);

SET LOCAL request.jwt.claim.sub = 'f3000000-0000-0000-0000-000000000004';
SET LOCAL request.jwt.claims =
  '{"sub":"f3000000-0000-0000-0000-000000000004","role":"authenticated"}';

SELECT is(
  (
    SELECT count(*)
    FROM public.policies
    WHERE key = 'personal_cancellation_cutoff_hours'
  ),
  1::bigint,
  'reception can read the cancellation cutoff required by schedule'
);

SET LOCAL request.jwt.claim.sub = 'f3000000-0000-0000-0000-000000000005';
SET LOCAL request.jwt.claims =
  '{"sub":"f3000000-0000-0000-0000-000000000005","role":"authenticated"}';

SELECT is(
  (
    SELECT count(*)
    FROM public.policies
    WHERE key = 'personal_cancellation_cutoff_hours'
  ),
  0::bigint,
  'student cannot read operational cancellation policies'
);

SET LOCAL request.jwt.claim.sub = 'f3000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims =
  '{"sub":"f3000000-0000-0000-0000-000000000002","role":"authenticated"}';

SELECT is(
  (SELECT count(*) FROM public.policies WHERE key = 'p0_3.test.visible'),
  1::bigint,
  'admin can read policy rows required by settings'
);

WITH changed AS (
  UPDATE public.policies
  SET value = '3'::jsonb
  WHERE key = 'p0_3.test.visible'
  RETURNING 1
)
SELECT is(
  (SELECT count(*) FROM changed),
  1::bigint,
  'admin can update an existing policy row'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
