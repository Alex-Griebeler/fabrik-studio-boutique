-- Onda 1.5a (LGPD-mínimo): CPF, dados bancários, PIX e notes dos
-- treinadores saem do alcance de recepção/instrutor NO BANCO, não só no
-- payload dos hooks (hook não é fronteira de segurança — auditoria
-- Codex, rodadas 2-3 do plano mestre 04/08).
--
-- Mecanismo: todos os papéis do app chegam ao Postgres como o MESMO
-- database role `authenticated` (RLS filtra LINHAS, não colunas). Logo:
--   1. revoga-se o SELECT amplo da tabela;
--   2. devolve-se SELECT POR COLUNA só no conjunto operacional
--      (agenda/telas gerais — inclui tarifas, que o formulário de
--      sessão usa para calcular pagamento);
--   3. a via administrativa (admin/manager: formulário de treinador,
--      folha) é uma VIEW com semântica security_definer (owner
--      postgres) gated por has_role DENTRO da view.
-- Efeito prático: `select("*")` em trainers passa a dar "permission
-- denied" para qualquer papel — inclusive admin le a tabela-base só
-- pelas colunas operacionais; o dado sensível vive atrás da view.
--
-- Mutações não quebram: os hooks de INSERT/UPDATE/DELETE não usam
-- .select() (return=minimal), e os privilégios de escrita + RLS de
-- linha ficam intocados.

-- 1) Revoga o SELECT amplo.
REVOKE SELECT ON public.trainers FROM authenticated;
REVOKE SELECT ON public.trainers FROM anon;

-- 2) SELECT por coluna: conjunto operacional.
GRANT SELECT (
  id, full_name, email, phone, bio, certifications, specialties,
  is_active, hired_at, terminated_at, profile_id,
  hourly_rate_main_cents, hourly_rate_assistant_cents,
  session_rate_cents, payment_method, created_at, updated_at
) ON public.trainers TO authenticated;

-- 3) Via administrativa (todas as colunas), gated por role na própria
-- view. Owner = executor da migration (postgres) => definer semantics.
CREATE OR REPLACE VIEW public.trainers_admin AS
SELECT t.*
FROM public.trainers t
WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'manager'::public.app_role);

COMMENT ON VIEW public.trainers_admin IS
  'Onda 1.5a: única via de leitura de cpf/banco/pix/notes de treinadores. Gated por has_role(admin|manager) dentro da view (definer semantics). Demais papéis leem apenas as colunas operacionais concedidas na tabela-base.';

REVOKE ALL ON public.trainers_admin FROM PUBLIC;
REVOKE ALL ON public.trainers_admin FROM anon;
GRANT SELECT ON public.trainers_admin TO authenticated;
