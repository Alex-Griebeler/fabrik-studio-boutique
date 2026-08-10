-- Onda 2c-1 — confiança de importação bancária fail-closed (D8 do plano 2c v5).
--
-- Toda importação passa a carregar a versão do parser que a produziu. O
-- default é 'unknown' DE PROPÓSITO: import gravado por um caminho que não
-- declara versão (Edge antiga ainda no ar, escrita fora do fluxo) nasce
-- NÃO-confiável. As RPCs de conciliação das PRs seguintes só aceitam
-- versões numa allowlist explícita — nunca "diferente de X" (fail-open).
--
-- Backfill: tudo que existe hoje foi importado antes do fix de sinal do OFX
-- (Onda 2e, PR #20) e tem sinais/classificação sem confiança — vira
-- 'legacy_untrusted', que nenhuma allowlist futura conterá.
--
-- Idempotente: a CI aplica duas vezes; a segunda passada não altera nada.

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.bank_imports
  ADD COLUMN IF NOT EXISTS parser_version text NOT NULL DEFAULT 'unknown';

UPDATE public.bank_imports
SET parser_version = 'legacy_untrusted'
WHERE parser_version = 'unknown';

COMMENT ON COLUMN public.bank_imports.parser_version IS
  'Versão do parser que produziu a importação (ofx-v2, csv-v1, xlsx-v1). '
  'unknown = caminho que não declara versão (não-confiável); legacy_untrusted = '
  'anterior ao fix de sinal do OFX (Onda 2e). Conciliação (Onda 2c) só opera '
  'sobre versões em allowlist explícita.';
