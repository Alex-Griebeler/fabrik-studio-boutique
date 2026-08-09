-- Testes do CONTRATO FINAL de Tarifas por Serviço (expand A + contract E).
-- Roda sobre tarifas-base.sql + migrations A/D/E aplicadas DUAS vezes cada
-- (o CI prova idempotência); aqui provamos o estado final: serviço
-- OBRIGATÓRIO (23502 sem ele), coerência definitiva (23514), tarifas.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, auth;

SELECT plan(49);

-- ---------- Estrutura ----------
SELECT has_table('public'::name, 'service_types'::name, 'service_types existe');
SELECT has_table('public'::name, 'trainer_service_rates'::name, 'trainer_service_rates existe');
SELECT has_column('public'::name, 'sessions'::name, 'service_type_id'::name, 'sessions.service_type_id existe');
SELECT has_column('public'::name, 'sessions'::name, 'payment_rate_basis'::name, 'sessions.payment_rate_basis existe');
SELECT has_column('public'::name, 'class_templates'::name, 'service_type_id'::name, 'class_templates.service_type_id existe');

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.service_types'::regclass),
  true, 'service_types com RLS ligada');
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.trainer_service_rates'::regclass),
  true, 'trainer_service_rates com RLS ligada');

-- ---------- Privilégios ----------
SELECT ok(NOT has_table_privilege('anon', 'public.service_types', 'SELECT'),
  'anon não lê o catálogo');
SELECT ok(NOT has_table_privilege('anon', 'public.trainer_service_rates', 'SELECT'),
  'anon não lê tarifas');
SELECT ok(has_table_privilege('authenticated', 'public.service_types', 'SELECT'),
  'authenticated alcança SELECT no catálogo (RLS decide as linhas)');
SELECT ok(NOT has_table_privilege('authenticated', 'public.service_types', 'DELETE'),
  'authenticated não deleta serviço (aposentadoria é is_active=false)');
SELECT ok(has_table_privilege('authenticated', 'public.trainer_service_rates', 'SELECT'),
  'authenticated alcança SELECT em tarifas (RLS decide as linhas)');

-- ---------- Seeds ----------
SELECT is(
  (SELECT count(*) FROM public.service_types WHERE slug IN ('grupo','personal','fisioterapia')),
  3::bigint, 'catálogo semeado com grupo/personal/fisioterapia');
SELECT is(
  (SELECT delivery_type::text FROM public.service_types WHERE slug = 'grupo'),
  'group', 'grupo entrega em formato coletivo');
SELECT is(
  (SELECT delivery_type::text FROM public.service_types WHERE slug = 'fisioterapia'),
  'personal', 'fisioterapia entrega em formato individual');

SELECT is(
  (SELECT count(*) FROM public.trainer_service_rates r
    WHERE r.trainer_id = '4fd214e3-214c-433d-bde2-5e91957dc95a'
      AND r.rate_basis = 'hourly' AND r.rate_cents = 10000),
  2::bigint, 'Alex semeado com grupo=100/h e personal=100/h');
SELECT is(
  (SELECT count(*) FROM public.trainer_service_rates
    WHERE trainer_id = '11111111-1111-1111-1111-111111111111'),
  0::bigint, 'nenhum 75/45 automático para os demais treinadores');

-- ---------- Backfill ----------
SELECT is(
  (SELECT st.slug FROM public.sessions s JOIN public.service_types st ON st.id = s.service_type_id
    WHERE s.id = '33333333-3333-3333-3333-333333333333'),
  'grupo', 'sessão de turma existente classificada como grupo');
SELECT is(
  (SELECT st.slug FROM public.sessions s JOIN public.service_types st ON st.id = s.service_type_id
    WHERE s.id = '44444444-4444-4444-4444-444444444444'),
  'personal', 'sessão personal existente classificada como personal');
SELECT is(
  (SELECT st.slug FROM public.class_templates ct JOIN public.service_types st ON st.id = ct.service_type_id
    WHERE ct.id = '22222222-2222-2222-2222-222222222222'),
  'grupo', 'template existente classificado como grupo');

-- ---------- Contrato final: serviço EXPLÍCITO e obrigatório ----------
-- Atravessa o caminho REAL de produção: authenticated + policy de INSERT
-- (admin/instructor) + guarda de coerência definitiva.
INSERT INTO public.user_roles (user_id, role) VALUES
  ('f8000000-0000-0000-0000-000000000001', 'admin'),
  ('f8000000-0000-0000-0000-000000000002', 'instructor');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f8000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"sub":"f8000000-0000-0000-0000-000000000001","role":"authenticated"}';

INSERT INTO public.sessions (id, session_type, modality, session_date, start_time, end_time, duration_minutes, service_type_id)
SELECT '55555555-5555-5555-5555-555555555555', 'group', 'hiit', '2026-08-10', '08:00', '09:00', 60, id
  FROM public.service_types WHERE slug = 'grupo';
SELECT is(
  (SELECT st.slug FROM public.sessions s JOIN public.service_types st ON st.id = s.service_type_id
    WHERE s.id = '55555555-5555-5555-5555-555555555555'),
  'grupo', 'sessão de turma nasce com serviço explícito');

INSERT INTO public.sessions (id, session_type, modality, session_date, start_time, end_time, duration_minutes, service_type_id)
SELECT '66666666-6666-6666-6666-666666666666', 'personal', 'personal', '2026-08-10', '09:00', '10:00', 60, id
  FROM public.service_types WHERE slug = 'personal';
SELECT is(
  (SELECT st.slug FROM public.sessions s JOIN public.service_types st ON st.id = s.service_type_id
    WHERE s.id = '66666666-6666-6666-6666-666666666666'),
  'personal', 'sessão personal nasce com serviço explícito');

-- session_type continua com DEFAULT group; o serviço é quem manda:
INSERT INTO public.sessions (id, modality, session_date, start_time, end_time, duration_minutes, service_type_id)
SELECT '88888888-8888-8888-8888-888888888888', 'flow', '2026-08-11', '06:00', '07:00', 60, id
  FROM public.service_types WHERE slug = 'grupo';
SELECT is(
  (SELECT st.slug FROM public.sessions s JOIN public.service_types st ON st.id = s.service_type_id
    WHERE s.id = '88888888-8888-8888-8888-888888888888'),
  'grupo', 'DEFAULT de session_type convive com serviço explícito');

INSERT INTO public.class_templates (id, modality, day_of_week, start_time, duration_minutes, service_type_id)
SELECT '77777777-7777-7777-7777-777777777777', 'btb', 3, '10:00', 60, id
  FROM public.service_types WHERE slug = 'grupo';
SELECT is(
  (SELECT st.slug FROM public.class_templates ct JOIN public.service_types st ON st.id = ct.service_type_id
    WHERE ct.id = '77777777-7777-7777-7777-777777777777'),
  'grupo', 'template nasce com serviço explícito');

-- PR-E: SEM serviço = ERRO do banco (o preenchimento transitório morreu;
-- nada adivinha classificação de dinheiro):
SELECT throws_ok(
  $$INSERT INTO public.sessions (session_type, modality, session_date, start_time, end_time, duration_minutes)
    VALUES ('group', 'flow', '2026-08-12', '06:00', '07:00', 60)$$,
  '23502', NULL, 'sessão sem serviço é rejeitada (NOT NULL, fim do transitório)');
SELECT throws_ok(
  $$INSERT INTO public.class_templates (modality, day_of_week, start_time, duration_minutes)
    VALUES ('flow', 5, '12:00', 60)$$,
  '23502', NULL, 'template sem serviço é rejeitado (NOT NULL)');

-- Guarda de coerência: serviço tem que bater com o formato.
SELECT throws_ok(
  $$INSERT INTO public.sessions (session_type, modality, session_date, start_time, end_time, duration_minutes, service_type_id)
    SELECT 'group', 'flow', '2026-08-12', '06:00', '07:00', 60, id
      FROM public.service_types WHERE slug = 'fisioterapia'$$,
  '23514', NULL, 'sessão de turma não nasce precificada como fisioterapia');
SELECT throws_ok(
  $$UPDATE public.sessions
       SET service_type_id = (SELECT id FROM public.service_types WHERE slug = 'fisioterapia')
     WHERE id = '55555555-5555-5555-5555-555555555555'$$,
  '23514', NULL, 'UPDATE não troca sessão de turma para serviço individual');
SELECT throws_ok(
  $$INSERT INTO public.class_templates (modality, day_of_week, start_time, duration_minutes, service_type_id)
    SELECT 'fisio', 4, '11:00', 60, id
      FROM public.service_types WHERE slug = 'fisioterapia'$$,
  '23514', NULL, 'template não aponta para serviço de formato individual nesta fase');

-- Fluxo real do bundle no ar: cancelar sessão (UPDATE de status) não pode
-- tropeçar no trigger que agora roda em todo UPDATE.
WITH cancelled AS (
  UPDATE public.sessions SET status = 'cancelled_on_time'
   WHERE id = '55555555-5555-5555-5555-555555555555'
  RETURNING 1
)
SELECT is((SELECT count(*) FROM cancelled), 1::bigint,
  'cancelamento (UPDATE de status) passa pelo trigger sem atrito');

RESET ROLE;

-- ---------- Constraints ----------
SELECT throws_ok(
  $$INSERT INTO public.trainer_service_rates (trainer_id, service_type_id, rate_basis, rate_cents)
    SELECT '4fd214e3-214c-433d-bde2-5e91957dc95a', id, 'hourly', 9000
      FROM public.service_types WHERE slug = 'grupo'$$,
  '23505', NULL, 'par treinador+serviço é único');
SELECT throws_ok(
  $$INSERT INTO public.trainer_service_rates (trainer_id, service_type_id, rate_basis, rate_cents)
    SELECT '11111111-1111-1111-1111-111111111111', id, 'hourly', 0
      FROM public.service_types WHERE slug = 'grupo'$$,
  '23514', NULL, 'tarifa zero é rejeitada');
SELECT throws_ok(
  $$INSERT INTO public.trainer_service_rates (trainer_id, service_type_id, rate_basis, rate_cents)
    SELECT '11111111-1111-1111-1111-111111111111', id, 'mensal', 5000
      FROM public.service_types WHERE slug = 'grupo'$$,
  '23514', NULL, 'base de cálculo fora de hourly/per_session é rejeitada');
SELECT throws_ok(
  $$UPDATE public.service_types SET slug = 'grupo_novo' WHERE slug = 'grupo'$$,
  '0A000', NULL, 'slug é imutável');
SELECT throws_ok(
  $$UPDATE public.service_types SET delivery_type = 'personal' WHERE slug = 'grupo'$$,
  '0A000', NULL, 'delivery_type é imutável (formato novo = serviço novo)');

-- ---------- updated_at e auditoria ----------
UPDATE public.service_types SET name = 'Grupo (turmas)' WHERE slug = 'grupo';
SELECT ok(
  (SELECT updated_at > created_at FROM public.service_types WHERE slug = 'grupo'),
  'updated_at avança em UPDATE no catálogo');

INSERT INTO public.trainer_service_rates (trainer_id, service_type_id, rate_basis, rate_cents)
SELECT '11111111-1111-1111-1111-111111111111', id, 'per_session', 7500
  FROM public.service_types WHERE slug = 'fisioterapia';
-- (os seeds do Alex na migration também são auditados — filtra a linha nova)
SELECT is(
  (SELECT count(*) FROM public.audit_log
    WHERE table_name = 'trainer_service_rates' AND action = 'insert'
      AND new_data->>'trainer_id' = '11111111-1111-1111-1111-111111111111'
      AND new_data->>'rate_cents' = '7500'),
  1::bigint, 'INSERT de tarifa cai na auditoria');

-- ---------- RLS por papel (usuários semeados no bloco do trigger) ----------
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT count(*) FROM public.trainer_service_rates$$,
  '42501', NULL, 'anon toma erro de privilégio em tarifas');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f8000000-0000-0000-0000-000000000009';
SET LOCAL request.jwt.claims = '{"sub":"f8000000-0000-0000-0000-000000000009","role":"authenticated"}';
SELECT is(
  (SELECT count(*) FROM public.service_types WHERE is_active),
  3::bigint, 'logado sem papel enxerga o catálogo');
SELECT is(
  (SELECT count(*) FROM public.trainer_service_rates),
  0::bigint, 'logado sem papel não enxerga tarifa nenhuma');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f8000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims = '{"sub":"f8000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT is(
  (SELECT count(*) FROM public.trainer_service_rates),
  3::bigint, 'instructor lê as tarifas (gera agenda no client)');
WITH changed AS (
  UPDATE public.trainer_service_rates SET rate_cents = 99999
   WHERE trainer_id = '4fd214e3-214c-433d-bde2-5e91957dc95a'
  RETURNING 1
)
SELECT is((SELECT count(*) FROM changed), 0::bigint,
  'instructor não altera tarifa (0 linhas)');
SELECT throws_ok(
  $$INSERT INTO public.trainer_service_rates (trainer_id, service_type_id, rate_basis, rate_cents)
    SELECT '11111111-1111-1111-1111-111111111111', id, 'hourly', 4500
      FROM public.service_types WHERE slug = 'grupo'$$,
  '42501', NULL, 'instructor não cria tarifa');
WITH changed AS (
  UPDATE public.service_types SET name = 'Hackeado' WHERE slug = 'grupo'
  RETURNING 1
)
SELECT is((SELECT count(*) FROM changed), 0::bigint,
  'instructor não edita o catálogo (0 linhas)');
SELECT throws_ok(
  $$INSERT INTO public.service_types (slug, name, delivery_type)
    VALUES ('pilates', 'Pilates', 'group')$$,
  '42501', NULL, 'instructor não cria serviço');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'f8000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims = '{"sub":"f8000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT is(
  (SELECT count(*) FROM public.trainer_service_rates),
  3::bigint, 'admin lê todas as tarifas');
INSERT INTO public.trainer_service_rates (trainer_id, service_type_id, rate_basis, rate_cents)
SELECT '11111111-1111-1111-1111-111111111111', id, 'hourly', 4500
  FROM public.service_types WHERE slug = 'grupo';
SELECT is(
  (SELECT count(*) FROM public.trainer_service_rates
    WHERE trainer_id = '11111111-1111-1111-1111-111111111111' AND rate_cents = 4500),
  1::bigint, 'admin cria tarifa');
WITH changed AS (
  UPDATE public.trainer_service_rates SET rate_cents = 5000
   WHERE trainer_id = '11111111-1111-1111-1111-111111111111' AND rate_cents = 4500
  RETURNING 1
)
SELECT is((SELECT count(*) FROM changed), 1::bigint, 'admin altera tarifa');
WITH removed AS (
  DELETE FROM public.trainer_service_rates
   WHERE trainer_id = '11111111-1111-1111-1111-111111111111' AND rate_cents = 5000
  RETURNING 1
)
SELECT is((SELECT count(*) FROM removed), 1::bigint, 'admin remove tarifa');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
