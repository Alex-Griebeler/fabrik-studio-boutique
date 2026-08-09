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
CREATE TYPE public.full_session_status AS ENUM (
  'scheduled', 'cancelled_on_time', 'cancelled_late', 'no_show',
  'completed', 'disputed', 'adjusted', 'late_arrival'
);

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
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid,
  full_name text NOT NULL
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- réplica da postura de produção: cada um lê o próprio perfil
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE TABLE public.trainers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id),
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

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL
);

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type public.session_type NOT NULL DEFAULT 'group',
  modality text NOT NULL,
  session_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  duration_minutes integer NOT NULL,
  status public.full_session_status NOT NULL DEFAULT 'scheduled',
  -- colunas que a view payable_sessions (PR-D) projeta:
  trainer_id uuid REFERENCES public.trainers(id),
  assistant_trainer_id uuid REFERENCES public.trainers(id),
  student_id uuid REFERENCES public.students(id),
  contract_id uuid,
  trainer_hourly_rate_cents integer,
  assistant_hourly_rate_cents integer,
  payment_hours numeric,
  payment_amount_cents integer,
  assistant_payment_amount_cents integer,
  is_paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz
);

-- Postura de produção nas tabelas legadas: RLS ligada e as policies de
-- sessions/class_templates VERBATIM de produção (aplicam a PUBLIC e
-- chamam has_role(auth.uid(), ...) sem embrulho) — os testes do trigger
-- transitório atravessam esse caminho real como authenticated.
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- réplica da postura de produção: linhas de trainers/students legíveis por
-- logado (colunas sensíveis de trainers são gated por GRANT em produção;
-- aqui o fixture só tem operacionais)
CREATE POLICY trainers_select ON public.trainers FOR SELECT
  USING (true);
CREATE POLICY students_select ON public.students FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'instructor'::app_role) OR has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY sessions_select ON public.sessions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'instructor'::app_role) OR has_role(auth.uid(), 'reception'::app_role));
CREATE POLICY sessions_insert ON public.sessions FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'instructor'::app_role));
CREATE POLICY sessions_update ON public.sessions FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'instructor'::app_role));
CREATE POLICY sessions_delete ON public.sessions FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY class_templates_select ON public.class_templates FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'instructor'::app_role) OR has_role(auth.uid(), 'reception'::app_role));
CREATE POLICY class_templates_insert ON public.class_templates FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY class_templates_update ON public.class_templates FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY class_templates_delete ON public.class_templates FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Linhas representativas de produção:
-- o Alex (uuid REAL de produção — a migration semeia as tarifas dele por id),
-- um treinador sem tarifas, um template de turma e uma sessão de cada formato.
-- Perfil do "dono" da sessão paga (vinculado ao usuário instructor dos
-- testes de papel da PR-D):
INSERT INTO public.profiles (id, auth_user_id, full_name)
VALUES ('f9110000-0000-0000-0000-000000000011', 'f9000000-0000-0000-0000-000000000001', 'Alex Griebeler');

INSERT INTO public.trainers (id, profile_id, full_name, hourly_rate_main_cents)
VALUES
  ('4fd214e3-214c-433d-bde2-5e91957dc95a', 'f9110000-0000-0000-0000-000000000011', 'Alex Griebeler', 10000),
  ('11111111-1111-1111-1111-111111111111', NULL, 'Treinador Sem Tarifa', 0);

INSERT INTO public.class_templates (id, modality, day_of_week, start_time, duration_minutes)
VALUES ('22222222-2222-2222-2222-222222222222', 'flow', 1, '06:00', 60);

-- A sessão personal não existe em produção HOJE, mas o branch personal do
-- backfill e do trigger precisa de cobertura (a tela de personal cria).
INSERT INTO public.sessions (id, session_type, modality, session_date, start_time, end_time, duration_minutes)
VALUES
  ('33333333-3333-3333-3333-333333333333', 'group',    'flow', '2026-08-03', '06:00', '07:00', 60),
  ('44444444-4444-4444-4444-444444444444', 'personal', 'personal', '2026-08-04', '07:00', '08:00', 60);

-- A view payable_sessions COMO ESTÁ EM PRODUÇÃO (22 colunas, invoker,
-- WHERE por enum): a migration da PR-D faz um CREATE OR REPLACE de
-- verdade por cima — ordem/tipo incompatível quebraria AQUI no CI.
CREATE VIEW public.payable_sessions
WITH (security_invoker = on) AS
SELECT s.id,
    s.session_date,
    s.start_time,
    s.end_time,
    s.duration_minutes,
    s.session_type,
    s.modality,
    s.status,
    s.trainer_id,
    t.full_name AS trainer_name,
    s.assistant_trainer_id,
    at.full_name AS assistant_trainer_name,
    s.trainer_hourly_rate_cents,
    s.assistant_hourly_rate_cents,
    s.payment_hours,
    s.payment_amount_cents,
    s.assistant_payment_amount_cents,
    s.is_paid,
    s.paid_at,
    s.student_id,
    st.full_name AS student_name,
    s.contract_id
   FROM public.sessions s
     LEFT JOIN public.trainers t ON t.id = s.trainer_id
     LEFT JOIN public.trainers at ON at.id = s.assistant_trainer_id
     LEFT JOIN public.students st ON st.id = s.student_id
  WHERE s.status = ANY (ARRAY['completed'::public.full_session_status, 'cancelled_late'::public.full_session_status, 'no_show'::public.full_session_status, 'late_arrival'::public.full_session_status]);

-- Sessão COMPLETED com snapshot: é a linha que a view payable_sessions
-- (PR-D) precisa projetar com service_name resolvido pelo catálogo.
INSERT INTO public.sessions (
  id, session_type, modality, session_date, start_time, end_time,
  duration_minutes, status, trainer_id, trainer_hourly_rate_cents,
  payment_hours, payment_amount_cents
) VALUES (
  '99999999-9999-9999-9999-999999999999', 'group', 'flow', '2026-08-05',
  '06:00', '07:00', 60, 'completed',
  '4fd214e3-214c-433d-bde2-5e91957dc95a', 10000, 1, 10000
);
