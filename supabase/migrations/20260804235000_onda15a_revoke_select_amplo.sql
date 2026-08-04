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

-- Reafirma os grants por coluna (REVOKE acima é total; o PASSO 1 pode
-- ter sido aplicado antes — GRANT é idempotente).
GRANT SELECT (
  id, full_name, email, phone, bio, certifications, specialties,
  is_active, hired_at, terminated_at, profile_id,
  hourly_rate_main_cents, hourly_rate_assistant_cents,
  session_rate_cents, payment_method, created_at, updated_at
) ON public.trainers TO authenticated;

-- Verificação embutida: aborta se a fronteira não ficou como desenhada.
DO $chk$
BEGIN
  IF has_column_privilege('authenticated', 'public.trainers', 'cpf', 'SELECT') THEN
    RAISE EXCEPTION 'onda15a: authenticated ainda le trainers.cpf';
  END IF;
  IF has_column_privilege('anon', 'public.trainers', 'id', 'SELECT') THEN
    RAISE EXCEPTION 'onda15a: anon ainda le trainers';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.trainers', 'full_name', 'SELECT') THEN
    RAISE EXCEPTION 'onda15a: coluna operacional full_name ficou inacessivel';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.trainers_admin', 'SELECT') THEN
    RAISE EXCEPTION 'onda15a: view trainers_admin inacessivel para authenticated';
  END IF;
END
$chk$;
