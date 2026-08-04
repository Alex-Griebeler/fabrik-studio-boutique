-- Onda 1.5a — PASSO 2 de 2: revoga o SELECT amplo em trainers.
-- PRÉ-CONDIÇÃO: PASSO 1 aplicado E frontend novo publicado (o bundle
-- antigo faz select("*") em trainers e passaria a falhar; abas abertas
-- com o bundle antigo precisam de reload — janela curta, horário morto).
--
-- Depois disto, select("*") em trainers devolve "permission denied"
-- para QUALQUER papel do app; o dado sensível só sai pela view
-- trainers_admin (admin) e as colunas operacionais pela tabela-base.

REVOKE SELECT ON public.trainers FROM PUBLIC;
REVOKE SELECT ON public.trainers FROM authenticated;
REVOKE SELECT ON public.trainers FROM anon;

-- Grants antigos POR COLUNA sobrevivem ao REVOKE de tabela — revoga as
-- colunas sensíveis explicitamente (rodada 2 do Codex).
REVOKE SELECT (cpf, pix_key, pix_key_type, bank_name, bank_agency, bank_account, notes)
  ON public.trainers FROM PUBLIC, anon, authenticated;

-- Reafirma os grants por coluna (REVOKE acima é total; o PASSO 1 pode
-- ter sido aplicado antes — GRANT é idempotente).
GRANT SELECT (
  id, full_name, email, phone, bio, certifications, specialties,
  is_active, hired_at, terminated_at, profile_id,
  hourly_rate_main_cents, hourly_rate_assistant_cents,
  session_rate_cents, payment_method, created_at, updated_at
) ON public.trainers TO authenticated;

-- Verificação embutida: aborta se a fronteira não ficou como desenhada.
-- Cobre TODAS as colunas sensíveis (não só cpf) e nega qualquer coluna
-- para anon (has_any_column_privilege).
DO $chk$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'cpf', 'pix_key', 'pix_key_type', 'bank_name', 'bank_agency',
    'bank_account', 'notes'
  ] LOOP
    IF has_column_privilege('authenticated', 'public.trainers', col, 'SELECT') THEN
      RAISE EXCEPTION 'onda15a: authenticated ainda le trainers.%', col;
    END IF;
  END LOOP;

  IF has_any_column_privilege('anon', 'public.trainers', 'SELECT') THEN
    RAISE EXCEPTION 'onda15a: anon ainda le alguma coluna de trainers';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.trainers', 'full_name', 'SELECT') THEN
    RAISE EXCEPTION 'onda15a: coluna operacional full_name ficou inacessivel';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.trainers_admin', 'SELECT') THEN
    RAISE EXCEPTION 'onda15a: view trainers_admin inacessivel para authenticated';
  END IF;
END
$chk$;
