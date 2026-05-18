-- =============================================================
-- SECURITY FIX — handle_new_user() não atribui mais 'admin' default.
-- =============================================================
-- A migration original 20260210001608 criou o trigger `handle_new_user`
-- que pra TODO novo registro em auth.users inseria
-- `user_roles (user_id, role) VALUES (NEW.id, 'admin')`. Combinado com
-- self-signup público em /login (removido em commit do mesmo PR desta
-- série), qualquer pessoa que conseguisse criar conta no Supabase
-- ganhava role admin no app.
--
-- Esta migration substitui a função pra:
--   1. Continuar criando o profile normalmente em public.profiles.
--   2. NÃO inserir mais nenhuma role automaticamente.
--
-- Roles passam a ser atribuídas explicitamente pelo admin via
-- user_roles (a tabela já tem RLS de INSERT/UPDATE restrita a quem
-- tem role admin). Novo usuário sem role não vê nada além de telas
-- públicas até que um admin atribua role manualmente.
--
-- IDEMPOTENTE — `CREATE OR REPLACE FUNCTION` substitui sem dropar.
--
-- NÃO TOCA EM:
--   - user_roles existentes (todas as roles atuais permanecem)
--   - profiles existentes
--   - auth.users (não cria nem deleta usuário)
--   - O trigger `on_auth_user_created` (continua apontando pra função)
--
-- Mantém SECURITY DEFINER e `SET search_path = public` exatamente
-- como o original (sem ampliar privilégios).
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  -- INTENCIONALMENTE NÃO insere em public.user_roles.
  -- Atribuição de role é responsabilidade exclusiva de um admin
  -- existente (via RLS de user_roles).
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
