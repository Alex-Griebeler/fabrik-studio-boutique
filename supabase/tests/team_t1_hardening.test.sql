-- pgTAP — PR T1: hardening de user_roles + team_operations + RPCs da saga.
-- Roda sobre team-base.sql + migration 20260812150000 aplicada DUAS vezes.
-- IDs do fixture: admin A=...000a, admin B=...000b, instrutor=...000c, aluna=...000d.

BEGIN;
SELECT plan(32);

-- ── 1. Privilégios ─────────────────────────────────────────────────────────

SELECT ok(NOT has_table_privilege('authenticated', 'public.user_roles', 'INSERT'),
  'authenticated não insere user_roles direto');
SELECT ok(NOT has_table_privilege('authenticated', 'public.user_roles', 'UPDATE'),
  'authenticated não atualiza user_roles direto');
SELECT ok(NOT has_table_privilege('authenticated', 'public.user_roles', 'DELETE'),
  'authenticated não deleta user_roles direto');
SELECT ok(has_table_privilege('authenticated', 'public.user_roles', 'SELECT'),
  'SELECT de user_roles preservado (RLS filtra)');
SELECT ok(NOT has_table_privilege('authenticated', 'public.team_operations', 'SELECT'),
  'team_operations invisível para authenticated');
SELECT ok(NOT has_table_privilege('anon', 'public.team_operations', 'SELECT'),
  'team_operations invisível para anon');
SELECT ok(NOT has_table_privilege('service_role', 'public.team_operations', 'DELETE'),
  'service_role não deleta team_operations');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.team_operations'::regclass),
  'RLS ligada em team_operations');
SELECT ok(NOT has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated sem USAGE no schema private');
SELECT ok(has_schema_privilege('service_role', 'private', 'USAGE'),
  'service_role com USAGE no schema private');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.team_set_roles(uuid, uuid, uuid, uuid, public.app_role[])', 'EXECUTE'),
  'authenticated não executa team_set_roles');
SELECT ok(has_function_privilege('service_role',
  'public.team_set_roles(uuid, uuid, uuid, uuid, public.app_role[])', 'EXECUTE'),
  'service_role executa team_set_roles');

-- ── 2. Guarda de user_roles ────────────────────────────────────────────────

SELECT throws_ok(
  $$ UPDATE public.user_roles SET role = 'manager'
     WHERE user_id = '00000000-0000-0000-0000-00000000000c' $$,
  'P0001', NULL,
  'UPDATE em user_roles sempre falha (linha imutável)');

-- Penúltimo admin sai; a exceção do fixture (2 admins) espelha produção.
SELECT lives_ok(
  $$ DELETE FROM public.user_roles
     WHERE user_id = '00000000-0000-0000-0000-00000000000b' AND role = 'admin' $$,
  'remover o penúltimo admin passa');

SELECT throws_ok(
  $$ DELETE FROM public.user_roles
     WHERE user_id = '00000000-0000-0000-0000-00000000000a' AND role = 'admin' $$,
  'T0003', NULL,
  'remover o ÚLTIMO admin falha com T0003');

-- Repõe o admin B e testa DELETE EM LOTE dos dois (a 2ª linha do mesmo
-- statement vê a 1ª já removida → aborta o statement inteiro).
INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-00000000000b', 'admin');
SELECT throws_ok(
  $$ DELETE FROM public.user_roles WHERE role = 'admin' $$,
  'T0003', NULL,
  'DELETE em lote de todos os admins aborta inteiro');
SELECT is(
  (SELECT count(*)::int FROM public.user_roles WHERE role = 'admin'), 2,
  'os 2 admins sobreviveram ao lote abortado');

-- Auditoria física: o INSERT de reposição acima gerou linha no audit_log.
SELECT ok(EXISTS (
  SELECT 1 FROM public.audit_log
  WHERE table_name = 'user_roles' AND action = 'insert'),
  'INSERT em user_roles auditado');

-- ── 3. Saga: begin/idempotência/fencing ────────────────────────────────────

-- begin novo
SELECT is(
  (public.team_begin_operation(
     '99999999-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-00000000000a',
     'set_roles', NULL, '00000000-0000-0000-0000-00000000000c', 'fp-1'
   ) ->> 'kind'),
  'new', 'begin de operação nova devolve kind=new');

-- ator não-admin → T0004
SELECT throws_ok(
  $$ SELECT public.team_begin_operation(
       '99999999-0000-0000-0000-000000000002',
       '00000000-0000-0000-0000-00000000000c',
       'set_roles', NULL, '00000000-0000-0000-0000-00000000000d', 'fp-x') $$,
  'T0004', NULL, 'ator sem admin toma T0004');

-- retry da mesma op com lease vivo → T0010
SELECT throws_ok(
  $$ SELECT public.team_begin_operation(
       '99999999-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-00000000000a',
       'set_roles', NULL, '00000000-0000-0000-0000-00000000000c', 'fp-1') $$,
  'T0010', NULL, 'retry com lease vivo toma T0010');

-- mesmo operation_id com fingerprint divergente → T0001
SELECT throws_ok(
  $$ SELECT public.team_begin_operation(
       '99999999-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-00000000000a',
       'set_roles', NULL, '00000000-0000-0000-0000-00000000000c', 'fp-DIFERENTE') $$,
  'T0001', NULL, 'assinatura divergente toma T0001');

-- claim por alvo: outra op (id novo) pro MESMO alvo+ação com lease vivo → T0005
SELECT throws_ok(
  $$ SELECT public.team_begin_operation(
       '99999999-0000-0000-0000-000000000003',
       '00000000-0000-0000-0000-00000000000a',
       'set_roles', NULL, '00000000-0000-0000-0000-00000000000c', 'fp-2') $$,
  'T0005', NULL, 'segundo begin no mesmo alvo toma T0005');

-- lease errado nas RPCs de mutação → T0002
SELECT throws_ok(
  $$ SELECT public.team_set_roles(
       '99999999-0000-0000-0000-000000000001',
       '99999999-9999-9999-9999-999999999999',
       '00000000-0000-0000-0000-00000000000a',
       '00000000-0000-0000-0000-00000000000c',
       ARRAY['instructor']::public.app_role[]) $$,
  'T0002', NULL, 'lease_token errado toma T0002 (fencing)');

-- ── 4. set_roles: student intocável + estado final ─────────────────────────

DO $seed$
DECLARE tok uuid;
BEGIN
  SELECT lease_token INTO tok FROM public.team_operations
  WHERE operation_id = '99999999-0000-0000-0000-000000000001';
  -- dá manager ao instrutor (mantendo instructor)
  PERFORM public.team_set_roles(
    '99999999-0000-0000-0000-000000000001', tok,
    '00000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000000c',
    ARRAY['instructor','manager']::public.app_role[]);
END $seed$;

SELECT is(
  (SELECT array_agg(role ORDER BY role)::text FROM public.user_roles
   WHERE user_id = '00000000-0000-0000-0000-00000000000c'),
  '{instructor,manager}',
  'set_roles aplicou o estado-alvo');

-- aluna com papel staff extra: set_roles remove o staff e NUNCA o student
INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-00000000000d', 'reception');
SELECT is(
  (public.team_begin_operation(
     '99999999-0000-0000-0000-000000000004',
     '00000000-0000-0000-0000-00000000000a',
     'revoke_access', NULL, '00000000-0000-0000-0000-00000000000d', 'fp-3'
   ) ->> 'kind'),
  'new', 'begin da revogação da conta híbrida');
DO $revoke$
DECLARE tok uuid;
BEGIN
  SELECT lease_token INTO tok FROM public.team_operations
  WHERE operation_id = '99999999-0000-0000-0000-000000000004';
  PERFORM public.team_revoke_access(
    '99999999-0000-0000-0000-000000000004', tok,
    '00000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000000d');
END $revoke$;
SELECT is(
  (SELECT array_agg(role ORDER BY role)::text FROM public.user_roles
   WHERE user_id = '00000000-0000-0000-0000-00000000000d'),
  '{student}',
  'revoke_access removeu o staff e preservou o student');

-- ── 5. Máquina de estados de team_operations ───────────────────────────────

-- terminal imutável: finaliza a op 1 e tenta mexer de novo
DO $fin$
DECLARE tok uuid;
BEGIN
  SELECT lease_token INTO tok FROM public.team_operations
  WHERE operation_id = '99999999-0000-0000-0000-000000000001';
  PERFORM public.team_finalize_operation(
    '99999999-0000-0000-0000-000000000001', tok, 'succeeded', 'roles_set', NULL, NULL);
END $fin$;

SELECT is(
  (SELECT status FROM public.team_operations
   WHERE operation_id = '99999999-0000-0000-0000-000000000001'),
  'succeeded', 'finalize gravou o terminal');
SELECT ok(
  (SELECT lease_token IS NULL AND lease_expires_at IS NULL AND finished_at IS NOT NULL
   FROM public.team_operations
   WHERE operation_id = '99999999-0000-0000-0000-000000000001'),
  'terminal limpou o lease e carimbou finished_at');
SELECT throws_ok(
  $$ UPDATE public.team_operations SET outcome = 'hack'
     WHERE operation_id = '99999999-0000-0000-0000-000000000001' $$,
  'P0001', NULL, 'terminal é imutável');

-- replay pós-terminal devolve o registrado
SELECT is(
  (public.team_begin_operation(
     '99999999-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-00000000000a',
     'set_roles', NULL, '00000000-0000-0000-0000-00000000000c', 'fp-1'
   ) ->> 'kind'),
  'replay', 'retry pós-terminal devolve kind=replay');

-- transição de phase ilegal (set_roles não conhece invite_requested)
SELECT throws_ok(
  $$ UPDATE public.team_operations SET phase = 'invite_requested'
     WHERE operation_id = '99999999-0000-0000-0000-000000000004' $$,
  'P0001', NULL, 'transição de phase ilegal é bloqueada');

SELECT * FROM finish();
ROLLBACK;
