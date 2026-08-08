-- Fixture mínimo de contrato de produção para os testes da PR-A de
-- Tarifas por Serviço. Usado só pelo GitHub Actions em projeto efêmero.
-- Reproduz: enums, has_role ENDURECIDA (self-only, como ficou em produção
-- em 08/08), infra de auditoria/updated_at, tabelas alvo com linhas
-- representativas, e os DEFAULT PRIVILEGES da nuvem (novas tabelas nascem
-- com GRANT amplo — a migration PRECISA revogar o que promete revogar).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Contrato da nuvem: tabelas novas nascem concedidas a todos os roles de API.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'instructor', 'student', 'manager', 'reception');
CREATE TYPE public.session_type AS ENUM ('personal', 'group');

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);

-- has_role como está em produção desde 08/08: self-only + boolean estrito,
-- EXECUTE concedido a anon e authenticated (as policies precisam avaliar).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    auth.uid() = _user_id
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    ),
    false)
$function$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'insert', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSE
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_audit_log() FROM PUBLIC, anon, authenticated;

-- Alvos da migration, com as colunas que ela toca.
CREATE TABLE public.trainers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  hourly_rate_main_cents integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.class_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modality text NOT NULL,
  day_of_week integer NOT NULL,
  start_time time NOT NULL,
  duration_minutes integer NOT NULL,
  capacity integer NOT NULL DEFAULT 8,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type public.session_type NOT NULL,
  modality text NOT NULL,
  session_date date NOT NULL,
  start_time time NOT NULL,
  duration_minutes integer NOT NULL
);

-- Postura de produção nas tabelas legadas: RLS ligada (o conteúdo das
-- policies legadas não é objeto desta PR; o trigger transitório roda em
-- INSERT feito como postgres/service nos testes).
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Linhas representativas de produção:
-- o Alex (uuid REAL de produção — a migration semeia as tarifas dele por id),
-- um treinador sem tarifas, um template de turma e uma sessão de cada formato.
INSERT INTO public.trainers (id, full_name, hourly_rate_main_cents)
VALUES
  ('4fd214e3-214c-433d-bde2-5e91957dc95a', 'Alex Griebeler', 10000),
  ('11111111-1111-1111-1111-111111111111', 'Treinador Sem Tarifa', 0);

INSERT INTO public.class_templates (id, modality, day_of_week, start_time, duration_minutes)
VALUES ('22222222-2222-2222-2222-222222222222', 'flow', 1, '06:00', 60);

INSERT INTO public.sessions (id, session_type, modality, session_date, start_time, duration_minutes)
VALUES
  ('33333333-3333-3333-3333-333333333333', 'group',    'flow', '2026-08-03', '06:00', 60),
  ('44444444-4444-4444-4444-444444444444', 'personal', 'personal', '2026-08-04', '07:00', 60);
