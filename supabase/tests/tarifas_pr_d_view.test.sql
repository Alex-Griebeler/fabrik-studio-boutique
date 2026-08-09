-- Testes da PR-D: a view payable_sessions projeta o serviço e a base,
-- com security_invoker preservado (RLS das tabelas-base vale pra quem lê).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, auth;

SELECT plan(11);

SELECT has_view('public'::name, 'payable_sessions'::name, 'view payable_sessions existe');
SELECT has_column('public'::name, 'payable_sessions'::name, 'service_name'::name, 'projeta service_name');
SELECT has_column('public'::name, 'payable_sessions'::name, 'payment_rate_basis'::name, 'projeta payment_rate_basis');

SELECT ok(
  (SELECT reloptions @> ARRAY['security_invoker=on'] FROM pg_class
    WHERE oid = 'public.payable_sessions'::regclass),
  'security_invoker segue ligado (RLS do leitor vale)');

-- A sessão completed do fixture aparece com o serviço RESOLVIDO pelo
-- catálogo (backfill da PR-A classificou como grupo):
SELECT is(
  (SELECT service_name FROM public.payable_sessions
    WHERE id = '99999999-9999-9999-9999-999999999999'),
  'Grupo', 'linha da folha carrega o nome do serviço');

-- Linha LEGADA (sem base gravada): payment_rate_basis nulo é projetado
-- como nulo — a UI trata como hourly implícito, a view não inventa.
SELECT is(
  (SELECT payment_rate_basis FROM public.payable_sessions
    WHERE id = '99999999-9999-9999-9999-999999999999'),
  NULL, 'base legada nula não é inventada pela view');

-- ---- Caminho REAL por papel: DONO na própria view ----
-- 01 = instructor VINCULADO ao treinador da sessão (perfil no fixture);
-- 03 = instructor SEM vínculo; 02 = manager; 04 = admin.
INSERT INTO public.user_roles (user_id, role) VALUES
  ('f9000000-0000-0000-0000-000000000001', 'instructor'),
  ('f9000000-0000-0000-0000-000000000002', 'manager'),
  ('f9000000-0000-0000-0000-000000000003', 'instructor'),
  ('f9000000-0000-0000-0000-000000000004', 'admin');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f9000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"sub":"f9000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT is(
  (SELECT count(*) FROM public.payable_sessions),
  1::bigint, 'instrutor DONO vê a própria linha da folha');
SELECT is(
  (SELECT service_name FROM public.payable_sessions
    WHERE id = '99999999-9999-9999-9999-999999999999'),
  'Grupo', 'dono resolve o service_name pelo join do catálogo');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f9000000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claims = '{"sub":"f9000000-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT is(
  (SELECT count(*) FROM public.payable_sessions),
  0::bigint, 'instrutor SEM vínculo NÃO lê a folha dos outros (dívida fechada)');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f9000000-0000-0000-0000-000000000004';
SET LOCAL request.jwt.claims = '{"sub":"f9000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT is(
  (SELECT count(*) FROM public.payable_sessions),
  1::bigint, 'admin vê a folha inteira');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f9000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"sub":"f9000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT is(
  (SELECT count(*) FROM public.payable_sessions),
  0::bigint, 'manager NÃO lê sessions (invoker) — por isso a rota da folha é admin-only');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
