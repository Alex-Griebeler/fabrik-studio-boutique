-- pgTAP — PR T1: hardening de user_roles + team_operations + RPCs da saga.
-- Roda sobre team-base.sql + migration 20260812150000 aplicada DUAS vezes.
-- IDs do fixture: admin A=...000a, admin B=...000b, instrutor=...000c, aluna=...000d.

BEGIN;
SELECT plan(60);

-- Passagem de tokens entre blocos DO e asserts.
CREATE TEMP TABLE _t1_tokens (k text PRIMARY KEY, v uuid) ON COMMIT DROP;

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
  'public.team_set_roles(uuid, uuid, public.app_role[])', 'EXECUTE'),
  'authenticated não executa team_set_roles');
SELECT ok(has_function_privilege('service_role',
  'public.team_set_roles(uuid, uuid, public.app_role[])', 'EXECUTE'),
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
    '99999999-0000-0000-0000-000000000004', tok);
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

-- ── 6. Rodada 1 do Codex: TRUNCATE, INSERT inválido, grants, binding ───────

SELECT ok(NOT has_table_privilege('service_role', 'public.team_operations', 'TRUNCATE'),
  'service_role não trunca team_operations');

SELECT throws_ok(
  $$ INSERT INTO public.team_operations
       (operation_id, actor_user_id, action, payload_fingerprint, status, phase,
        lease_token, lease_expires_at)
     VALUES ('99999999-0000-0000-0000-00000000ffff',
       '00000000-0000-0000-0000-00000000000a', 'invite', 'fp', 'succeeded',
       'preflight', gen_random_uuid(), now()) $$,
  'P0001', NULL, 'INSERT não nasce em estado terminal');

SELECT ok(NOT has_function_privilege('authenticated',
  'public.team_begin_operation(uuid, uuid, text, text, uuid, text)', 'EXECUTE'),
  'authenticated não executa team_begin_operation');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.team_advance_phase(uuid, uuid, text, uuid, jsonb)', 'EXECUTE'),
  'authenticated não executa team_advance_phase');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.team_finalize_operation(uuid, uuid, text, text, text, jsonb)', 'EXECUTE'),
  'authenticated não executa team_finalize_operation');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.team_assign_role_after_invite(uuid, uuid, public.app_role)', 'EXECUTE'),
  'authenticated não executa team_assign_role_after_invite');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.team_revoke_access(uuid, uuid)', 'EXECUTE'),
  'authenticated não executa team_revoke_access');
SELECT ok(has_function_privilege('service_role',
  'public.team_begin_operation(uuid, uuid, text, text, uuid, text)', 'EXECUTE'),
  'service_role executa team_begin_operation');

-- op5: set_roles started — o lease dela NÃO serve para outra ação (binding).
DO $b5$
DECLARE r jsonb;
BEGIN
  r := public.team_begin_operation(
    '99999999-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-00000000000a',
    'set_roles', NULL, '00000000-0000-0000-0000-00000000000c', 'fp-5');
  INSERT INTO _t1_tokens VALUES ('op5', (r ->> 'lease_token')::uuid);
END $b5$;

SELECT throws_ok(
  format($$ SELECT public.team_assign_role_after_invite(
    '99999999-0000-0000-0000-000000000005', %L, 'manager'::public.app_role) $$,
    (SELECT v FROM _t1_tokens WHERE k = 'op5')),
  'T0001', NULL,
  'lease de set_roles NÃO atribui papel de convite (binding por ação)');

-- detail: campo proibido e campo fora da allowlist
SELECT throws_ok(
  format($$ SELECT public.team_advance_phase(
    '99999999-0000-0000-0000-000000000005', %L, 'preflight', NULL,
    '{"lease_token":"x"}'::jsonb) $$,
    (SELECT v FROM _t1_tokens WHERE k = 'op5')),
  'P0001', NULL, 'detail com campo PROIBIDO é rejeitado');
SELECT throws_ok(
  format($$ SELECT public.team_advance_phase(
    '99999999-0000-0000-0000-000000000005', %L, 'preflight', NULL,
    '{"foo":1}'::jsonb) $$,
    (SELECT v FROM _t1_tokens WHERE k = 'op5')),
  'P0001', NULL, 'detail fora da allowlist é rejeitado');

-- target_user_id: transição única (op5 nasceu com alvo — trocar é proibido)
SELECT throws_ok(
  format($$ SELECT public.team_advance_phase(
    '99999999-0000-0000-0000-000000000005', %L, 'preflight',
    '00000000-0000-0000-0000-00000000000d', NULL) $$,
    (SELECT v FROM _t1_tokens WHERE k = 'op5')),
  'P0001', NULL, 'target_user_id não muda depois de persistido');

-- Fencing pós-takeover: lease vencido → begin assume com token NOVO; o antigo
-- não escreve mais.
UPDATE public.team_operations
SET lease_expires_at = now() - interval '1 second'
WHERE operation_id = '99999999-0000-0000-0000-000000000005';

DO $tk$
DECLARE r jsonb;
BEGIN
  r := public.team_begin_operation(
    '99999999-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-00000000000a',
    'set_roles', NULL, '00000000-0000-0000-0000-00000000000c', 'fp-5');
  INSERT INTO _t1_tokens VALUES ('op5kind', NULL);
  UPDATE _t1_tokens SET v = (r ->> 'lease_token')::uuid WHERE k = 'op5kind';
  INSERT INTO _t1_tokens VALUES ('op5novo', (r ->> 'lease_token')::uuid);
  IF (r ->> 'kind') <> 'takeover' THEN
    RAISE EXCEPTION 'esperado takeover, veio %', r ->> 'kind';
  END IF;
END $tk$;

SELECT throws_ok(
  format($$ SELECT public.team_advance_phase(
    '99999999-0000-0000-0000-000000000005', %L, 'preflight', NULL, NULL) $$,
    (SELECT v FROM _t1_tokens WHERE k = 'op5')),
  'T0002', NULL, 'token ANTIGO pós-takeover não escreve (fencing)');

-- Terminal inutiliza até o token novo.
DO $f5$
BEGIN
  PERFORM public.team_finalize_operation(
    '99999999-0000-0000-0000-000000000005',
    (SELECT v FROM _t1_tokens WHERE k = 'op5novo'),
    'failed', 'rejected', NULL, NULL);
END $f5$;
SELECT throws_ok(
  format($$ SELECT public.team_advance_phase(
    '99999999-0000-0000-0000-000000000005', %L, 'preflight', NULL, NULL) $$,
    (SELECT v FROM _t1_tokens WHERE k = 'op5novo')),
  'T0002', NULL, 'token não sobrevive ao terminal');

-- Cooldown de send_recovery: terminal recente bloqueia novo begin (T0011).
DO $rec$
DECLARE r jsonb;
BEGIN
  r := public.team_begin_operation(
    '99999999-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-00000000000a',
    'send_recovery', NULL, '00000000-0000-0000-0000-00000000000c', 'fp-6');
  PERFORM public.team_advance_phase(
    '99999999-0000-0000-0000-000000000006', (r ->> 'lease_token')::uuid,
    'recovery_requested', NULL, NULL);
  PERFORM public.team_finalize_operation(
    '99999999-0000-0000-0000-000000000006', (r ->> 'lease_token')::uuid,
    'succeeded', 'recovery_requested', NULL, NULL);
END $rec$;
SELECT throws_ok(
  $$ SELECT public.team_begin_operation(
    '99999999-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-00000000000a',
    'send_recovery', NULL, '00000000-0000-0000-0000-00000000000c', 'fp-7') $$,
  'T0011', NULL, 'cooldown de recovery bloqueia reenvio (T0011)');

-- Matriz por ação: invite não pula de preflight para role_assigned.
DO $b8$
BEGIN
  PERFORM public.team_begin_operation(
    '99999999-0000-0000-0000-000000000008',
    '00000000-0000-0000-0000-00000000000a',
    'invite', 'nova@fabrik.test', NULL, 'fp-8');
END $b8$;
SELECT throws_ok(
  $$ UPDATE public.team_operations SET phase = 'role_assigned'
     WHERE operation_id = '99999999-0000-0000-0000-000000000008' $$,
  'P0001', NULL, 'invite não pula preflight→role_assigned');

-- ── 7. Rodada 2 do Codex: replay sem token, grants positivos, fencing em
--        assign/finalize, ator rebaixado real, detail direto, matriz recovery ─

-- replay real (op1 é terminal): o retorno NÃO carrega lease_token
SELECT ok(
  NOT ((public.team_begin_operation(
     '99999999-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-00000000000a',
     'set_roles', NULL, '00000000-0000-0000-0000-00000000000c', 'fp-1')) ? 'lease_token'),
  'replay não vaza lease_token');

SELECT ok(has_function_privilege('service_role',
  'public.team_advance_phase(uuid, uuid, text, uuid, jsonb)', 'EXECUTE'),
  'service_role executa team_advance_phase');
SELECT ok(has_function_privilege('service_role',
  'public.team_finalize_operation(uuid, uuid, text, text, text, jsonb)', 'EXECUTE'),
  'service_role executa team_finalize_operation');
SELECT ok(has_function_privilege('service_role',
  'public.team_assign_role_after_invite(uuid, uuid, public.app_role)', 'EXECUTE'),
  'service_role executa team_assign_role_after_invite');
SELECT ok(has_function_privilege('service_role',
  'public.team_revoke_access(uuid, uuid)', 'EXECUTE'),
  'service_role executa team_revoke_access');

-- fencing também em assign e finalize (op5 está terminal; token morto)
SELECT throws_ok(
  format($$ SELECT public.team_assign_role_after_invite(
    '99999999-0000-0000-0000-000000000005', %L, 'manager'::public.app_role) $$,
    (SELECT v FROM _t1_tokens WHERE k = 'op5novo')),
  'T0002', NULL, 'assign com token morto toma T0002');
SELECT throws_ok(
  format($$ SELECT public.team_finalize_operation(
    '99999999-0000-0000-0000-000000000005', %L, 'failed', 'x', NULL, NULL) $$,
    (SELECT v FROM _t1_tokens WHERE k = 'op5novo')),
  'T0002', NULL, 'finalize com token morto toma T0002');

-- Ator REBAIXADO DE VERDADE pós-begin: mutação de privilégio recusa (T0004),
-- mas a FINALIZAÇÃO com o lease vigente funciona (R3-5 — nada fica preso).
DO $b9$
DECLARE r jsonb;
BEGIN
  r := public.team_begin_operation(
    '99999999-0000-0000-0000-000000000009',
    '00000000-0000-0000-0000-00000000000b',
    'revoke_access', NULL, '00000000-0000-0000-0000-00000000000c', 'fp-9');
  INSERT INTO _t1_tokens VALUES ('op9', (r ->> 'lease_token')::uuid);
END $b9$;
DELETE FROM public.user_roles
WHERE user_id = '00000000-0000-0000-0000-00000000000b' AND role = 'admin';

SELECT throws_ok(
  format($$ SELECT public.team_revoke_access(
    '99999999-0000-0000-0000-000000000009', %L) $$,
    (SELECT v FROM _t1_tokens WHERE k = 'op9')),
  'T0004', NULL, 'ator rebaixado após begin não muta privilégio');
SELECT lives_ok(
  format($$ SELECT public.team_finalize_operation(
    '99999999-0000-0000-0000-000000000009', %L,
    'partial', 'rejected', 'actor_not_admin', NULL) $$,
    (SELECT v FROM _t1_tokens WHERE k = 'op9')),
  'finalização não exige ator admin — operação nunca fica presa');

-- detail por escrita DIRETA também é validado
SELECT throws_ok(
  $$ INSERT INTO public.team_operations
       (operation_id, actor_user_id, action, payload_fingerprint,
        lease_token, lease_expires_at, detail)
     VALUES ('99999999-0000-0000-0000-00000000fffe',
       '00000000-0000-0000-0000-00000000000a', 'invite', 'fp',
       gen_random_uuid(), now() + interval '90 seconds',
       '{"action_link":"https://x"}'::jsonb) $$,
  'P0001', NULL, 'INSERT direto não nasce com detail preenchido');

DO $b10$
BEGIN
  PERFORM public.team_begin_operation(
    '99999999-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-00000000000a',
    'send_recovery', NULL, '00000000-0000-0000-0000-00000000000d', 'fp-10');
END $b10$;
SELECT throws_ok(
  $$ UPDATE public.team_operations
     SET detail = '{"lease_token":"vazado"}'::jsonb
     WHERE operation_id = '99999999-0000-0000-0000-000000000010' $$,
  'P0001', NULL, 'UPDATE direto de detail passa pela allowlist');

-- matriz: send_recovery não conhece auth_user_observed
SELECT throws_ok(
  $$ UPDATE public.team_operations SET phase = 'auth_user_observed'
     WHERE operation_id = '99999999-0000-0000-0000-000000000010' $$,
  'P0001', NULL, 'send_recovery não entra em phase de convite');

SELECT * FROM finish();
ROLLBACK;
