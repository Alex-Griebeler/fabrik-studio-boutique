-- Testes da PR-D: a view payable_sessions projeta o serviço e a base,
-- com security_invoker preservado (RLS das tabelas-base vale pra quem lê).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, auth;

SELECT plan(13);

SELECT has_view('public'::name, 'payable_sessions'::name, 'view payable_sessions existe');
SELECT has_column('public'::name, 'payable_sessions'::name, 'service_name'::name, 'projeta service_name');
SELECT has_column('public'::name, 'payable_sessions'::name, 'payment_rate_basis'::name, 'projeta payment_rate_basis');

SELECT ok(
  (SELECT reloptions @> ARRAY['security_invoker=on'] FROM pg_class
    WHERE oid = 'public.payable_sessions'::regclass),
  'security_invoker segue ligado (RLS do leitor vale)');

-- O predicado de DONO filtra qualquer caller sem papel — inclusive o
-- postgres (auth.uid() nulo): a view precisa vir VAZIA fora dos papéis.
SELECT is(
  (SELECT count(*) FROM public.payable_sessions),
  0::bigint, 'sem papel (auth.uid() nulo) a folha vem vazia — dono na view');

-- ---- Caminho REAL por papel: DONO na própria view ----
-- 01 = instructor VINCULADO ao treinador da sessão (perfil no fixture);
-- 03 = instructor SEM vínculo; 02 = manager; 04 = admin.
INSERT INTO public.user_roles (user_id, role) VALUES
  ('f9000000-0000-0000-0000-000000000001', 'instructor'),
  ('f9000000-0000-0000-0000-000000000002', 'manager'),
  ('f9000000-0000-0000-0000-000000000003', 'instructor'),
  ('f9000000-0000-0000-0000-000000000004', 'admin'),
  ('f9000000-0000-0000-0000-000000000005', 'reception');

-- Recepcionista TAMBÉM vinculada a um perfil de treinador (caso-armadilha:
-- vínculo sem o PAPEL instructor não abre a folha):
INSERT INTO public.profiles (id, auth_user_id, full_name)
VALUES ('f9110000-0000-0000-0000-000000000055', 'f9000000-0000-0000-0000-000000000005', 'Recepção Que Treina');
UPDATE public.trainers SET profile_id = 'f9110000-0000-0000-0000-000000000055'
 WHERE id = '11111111-1111-1111-1111-111111111111';

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
SELECT is(
  (SELECT service_name FROM public.payable_sessions
    WHERE id = '99999999-9999-9999-9999-999999999999'),
  'Grupo', 'admin resolve o service_name pelo join do catálogo');
-- Linha LEGADA (sem base gravada): nulo projetado como nulo — a UI trata
-- como hourly implícito, a view não inventa.
SELECT is(
  (SELECT payment_rate_basis FROM public.payable_sessions
    WHERE id = '99999999-9999-9999-9999-999999999999'),
  NULL, 'base legada nula não é inventada pela view');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f9000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"sub":"f9000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT is(
  (SELECT count(*) FROM public.payable_sessions),
  0::bigint, 'manager NÃO lê sessions (invoker) — por isso a rota da folha é admin-only');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f9000000-0000-0000-0000-000000000005';
SET LOCAL request.jwt.claims = '{"sub":"f9000000-0000-0000-0000-000000000005","role":"authenticated"}';
SELECT is(
  (SELECT count(*) FROM public.payable_sessions),
  0::bigint, 'reception com vínculo de treinador mas SEM papel instructor: zero');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
