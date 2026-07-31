-- Minimal production-contract fixture for the P0-1 and P0-4 migrations.
-- This file is used only by GitHub Actions in an ephemeral Supabase project.
-- It intentionally models only objects referenced by the target migration and
-- its pgTAP suite; it is not a production migration or schema snapshot.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE TYPE public.app_role AS ENUM (
  'admin',
  'manager',
  'reception',
  'instructor',
  'student'
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(
  _user_id uuid,
  _role public.app_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)
  TO anon, authenticated, service_role;

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  source text,
  status text NOT NULL DEFAULT 'new',
  trial_date date,
  qualification_details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL,
  start_date date NOT NULL,
  cancelled_at timestamptz
);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  status text NOT NULL,
  due_date date NOT NULL,
  paid_amount_cents integer NOT NULL DEFAULT 0,
  payment_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  status text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  payment_date date
);

CREATE TABLE public.monthly_kpis (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  competencia date NOT NULL UNIQUE,
  total_leads integer NOT NULL DEFAULT 0,
  leads_marketing integer NOT NULL DEFAULT 0,
  leads_indicacao integer NOT NULL DEFAULT 0,
  leads_resgate integer NOT NULL DEFAULT 0,
  total_experimentais integer NOT NULL DEFAULT 0,
  total_conversoes integer NOT NULL DEFAULT 0,
  conversoes_indicacao integer NOT NULL DEFAULT 0,
  conversoes_marketing integer NOT NULL DEFAULT 0,
  taxa_conversao_leads numeric NOT NULL DEFAULT 0,
  taxa_conversao_experimentais numeric NOT NULL DEFAULT 0,
  planos_para_renovar integer NOT NULL DEFAULT 0,
  renovacoes_efetivas integer NOT NULL DEFAULT 0,
  taxa_renovacao numeric NOT NULL DEFAULT 0,
  cancelamentos integer NOT NULL DEFAULT 0,
  taxa_churn numeric NOT NULL DEFAULT 0,
  faturamento_cents integer NOT NULL DEFAULT 0,
  despesas_cents integer NOT NULL DEFAULT 0,
  resultado_cents integer NOT NULL DEFAULT 0,
  margem_lucro_pct numeric NOT NULL DEFAULT 0,
  total_alunos integer NOT NULL DEFAULT 0,
  alunos_novos integer NOT NULL DEFAULT 0,
  alunos_perdidos integer NOT NULL DEFAULT 0,
  calculado_em timestamptz NOT NULL DEFAULT now()
);

-- Minimal pre-P0-4 nurturing model. The unsafe cron is intentional: the
-- target migration must remove it without scheduling a replacement.
CREATE TABLE public.nurturing_sequences (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name text NOT NULL
);

CREATE TABLE public.sequence_steps (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.nurturing_sequences(id),
  step_number integer NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp'
);

CREATE TABLE public.sequence_executions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.nurturing_sequences(id),
  lead_id uuid NOT NULL REFERENCES public.leads(id),
  current_step integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  next_step_at timestamptz
);

CREATE TABLE public.sequence_step_events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.sequence_executions(id),
  step_id uuid NOT NULL REFERENCES public.sequence_steps(id),
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

SELECT cron.schedule(
  'execute-nurturing-steps-every-5min',
  '*/5 * * * *',
  'SELECT 1'
);

-- Recreate the vulnerable overload so the target migration must remove it.
CREATE OR REPLACE FUNCTION public.update_lead_anamnese(
  p_lead_id uuid,
  p_qualification_details jsonb,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
  SET qualification_details = p_qualification_details,
      name = COALESCE(p_name, name),
      phone = COALESCE(p_phone, phone),
      email = COALESCE(p_email, email),
      updated_at = now()
  WHERE id = p_lead_id;
END;
$$;
