-- pgTAP — Onda 2c-1: parser_version fail-closed em bank_imports.
-- Roda sobre o fixture conciliacao-base.sql + migration aplicada DUAS vezes.

BEGIN;
SELECT plan(7);

-- 1. A coluna existe e é NOT NULL
SELECT has_column('public', 'bank_imports', 'parser_version', 'bank_imports.parser_version existe');
SELECT col_not_null('public', 'bank_imports', 'parser_version', 'parser_version é NOT NULL');

-- 2. Default fail-closed: import criado sem declarar versão nasce 'unknown'
SELECT col_default_is('public', 'bank_imports', 'parser_version', '''unknown''::text',
  'default é unknown (não-confiável)');

-- 3. Backfill: TODOS os imports pré-existentes viraram legacy_untrusted
SELECT is(
  (SELECT count(*)::int FROM public.bank_imports WHERE parser_version = 'legacy_untrusted'),
  2,
  'os imports legados do fixture foram backfillados para legacy_untrusted'
);
SELECT is(
  (SELECT count(*)::int FROM public.bank_imports WHERE parser_version NOT IN ('legacy_untrusted')),
  0,
  'nenhum import pré-existente escapou do backfill'
);

-- 4. Insert novo sem versão explícita nasce unknown (quarentena A4)
INSERT INTO public.bank_imports (file_name, file_type, status)
VALUES ('novo_sem_versao.ofx', 'ofx', 'processing');
SELECT is(
  (SELECT parser_version FROM public.bank_imports WHERE file_name = 'novo_sem_versao.ofx'),
  'unknown',
  'import criado sem declarar versão nasce unknown'
);

-- 5. Insert declarando versão (caminho da Edge nova) grava a versão
INSERT INTO public.bank_imports (file_name, file_type, status, parser_version)
VALUES ('novo_versionado.ofx', 'ofx', 'processing', 'ofx-v2');
SELECT is(
  (SELECT parser_version FROM public.bank_imports WHERE file_name = 'novo_versionado.ofx'),
  'ofx-v2',
  'a Edge versionada consegue declarar a versão'
);

SELECT * FROM finish();
ROLLBACK;
