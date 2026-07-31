-- Minimal production-contract fixture for the P0-3a migration tests.
-- This file is used only by GitHub Actions in an ephemeral Supabase project.
-- It intentionally models only objects referenced by the target migration and
-- its pgTAP suite; it is not a production migration or schema snapshot.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

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

CREATE TABLE public.policies (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

-- Mirror the permissive pre-P0 grants and policies observed in production so
-- the target migration must close the vulnerable starting state.
GRANT ALL PRIVILEGES ON TABLE public.policies
  TO anon, authenticated;

CREATE POLICY "policies_select"
ON public.policies
FOR SELECT
TO PUBLIC
USING (true);

CREATE POLICY "policies_insert"
ON public.policies
FOR INSERT
TO authenticated
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE POLICY "policies_update"
ON public.policies
FOR UPDATE
TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE POLICY "policies_delete"
ON public.policies
FOR DELETE
TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

INSERT INTO public.policies (key, value, description)
VALUES
  ('personal_cancellation_cutoff_hours', '12'::jsonb, 'Personal cutoff fixture'),
  ('group_cancellation_cutoff_hours', '6'::jsonb, 'Group cutoff fixture');
