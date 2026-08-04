-- Onda 1.5a — PASSO 1 de 2 (aditivo, seguro com o frontend antigo no ar):
-- cria a via administrativa e os grants por coluna, SEM revogar nada.
-- O revoke do SELECT amplo vem no PASSO 2
-- (20260804235000_onda15a_revoke_select_amplo.sql), aplicado DEPOIS do
-- frontend novo publicado. Sequência completa:
--   aplicar PASSO 1 -> merge + publicar frontend -> aplicar PASSO 2.
--
-- Racional (auditoria Codex, plano mestre 04/08): hook não é fronteira
-- de segurança; todos os papéis do app chegam ao Postgres como o MESMO
-- database role `authenticated` (RLS filtra LINHAS, não colunas). A
-- blindagem de CPF/banco/PIX/notes de treinadores é grant POR COLUNA +
-- view administrativa com semântica definer, gated por has_role DENTRO
-- da view.
--
-- Decisão de papel: a view é ADMIN-ONLY. `manager` nunca teve SELECT em
-- trainers pela RLS (policy 20260210234011: admin/instructor/reception)
-- e a escrita sempre foi admin-only — a rota /instructors aceitar
-- manager é incoerência PRÉ-EXISTENTE, registrada para a matriz de
-- papéis da Onda 4/5, não resolvida aqui.

-- 1) Grants por coluna (aditivos; idempotentes por natureza de GRANT).
GRANT SELECT (
  id, full_name, email, phone, bio, certifications, specialties,
  is_active, hired_at, terminated_at, profile_id,
  hourly_rate_main_cents, hourly_rate_assistant_cents,
  session_rate_cents, payment_method, created_at, updated_at
) ON public.trainers TO authenticated;

-- 2) Via administrativa (todas as colunas), gated por role na própria
-- view. Owner = executor da migration (postgres) => definer semantics.
CREATE OR REPLACE VIEW public.trainers_admin AS
SELECT t.*
FROM public.trainers t
WHERE public.has_role(auth.uid(), 'admin'::public.app_role);

COMMENT ON VIEW public.trainers_admin IS
  'Onda 1.5a: única via de leitura de cpf/banco/pix/notes de treinadores. Gated por has_role(admin) dentro da view (definer semantics). Demais papéis leem apenas as colunas operacionais concedidas na tabela-base.';

REVOKE ALL ON public.trainers_admin FROM PUBLIC;
REVOKE ALL ON public.trainers_admin FROM anon;
GRANT SELECT ON public.trainers_admin TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260804230000', 'onda15a_trainers_column_privileges')
ON CONFLICT (version) DO NOTHING;