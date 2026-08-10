-- Onda 2c-1 — confiança de importação bancária fail-closed (D8 do plano 2c v5).
--
-- Toda importação passa a carregar a versão do parser que a produziu. O
-- default é 'unknown' DE PROPÓSITO: import gravado por um caminho que não
-- declara versão (Edge antiga ainda no ar, escrita fora do fluxo) nasce
-- NÃO-confiável. As RPCs de conciliação das PRs seguintes só aceitam
-- versões numa allowlist explícita — nunca "diferente de X" (fail-open).
--
-- Ordem dos passos importa (idempotência SEMÂNTICA, não só sintática):
-- a coluna nasce SEM default, o backfill pega só IS NULL (= linhas que
-- existiam antes da coluna), e só então entram default e NOT NULL. Assim
-- uma reaplicação NUNCA reclassifica um import 'unknown' legítimo criado
-- na janela entre a migration e o deploy da Edge versionada (quarentena
-- A4) como 'legacy_untrusted' — o backfill de reaplicação não encontra
-- NULL nenhum e não toca em nada.
--
-- Backfill: tudo que existe hoje foi importado antes do fix de sinal do OFX
-- (Onda 2e, PR #20) e tem sinais/classificação sem confiança — vira
-- 'legacy_untrusted', que nenhuma allowlist futura conterá.

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.bank_imports
  ADD COLUMN IF NOT EXISTS parser_version text;

UPDATE public.bank_imports
SET parser_version = 'legacy_untrusted'
WHERE parser_version IS NULL;

ALTER TABLE public.bank_imports
  ALTER COLUMN parser_version SET DEFAULT 'unknown';

ALTER TABLE public.bank_imports
  ALTER COLUMN parser_version SET NOT NULL;

COMMENT ON COLUMN public.bank_imports.parser_version IS
  'Versão do parser que produziu a importação (ofx-v2, csv-v1, xlsx-v1). '
  'unknown = caminho que não declara versão (não-confiável); legacy_untrusted = '
  'anterior ao fix de sinal do OFX (Onda 2e). Conciliação (Onda 2c) só opera '
  'sobre versões em allowlist explícita.';
