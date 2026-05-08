-- =============================================================
-- Integração EVO → agente de faltas (Fase 2 — fundação).
-- =============================================================
-- Cria a fonte normalizada de eventos de presença usada pelo detector
-- (`attendance_events`) e as tabelas de mapping entre identificadores
-- EVO e o CRM (`evo_student_mappings`, `evo_trainer_mappings`).
--
-- Não toca em `sessions`, `class_bookings`, `attendance_alerts`,
-- `policies`, `trainers` ou `students`.
--
-- Não contém segredo. Token EVO fica em Supabase Function Secret.
-- =============================================================

-- ─────────── 1. Enums ───────────
DO $$ BEGIN
  CREATE TYPE public.attendance_event_status AS ENUM (
    'present',
    'no_show',
    'cancelled_late',
    'cancelled_on_time'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_event_source AS ENUM (
    'evo',
    'internal_session',
    'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.evo_student_match_method AS ENUM (
    'cpf',
    'email',
    'manual',
    'unmatched'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.evo_trainer_match_method AS ENUM (
    'email',
    'name',
    'manual',
    'unmatched'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────── 2. Tabela attendance_events ───────────
CREATE TABLE IF NOT EXISTS public.attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quem
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  trainer_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,
  assistant_trainer_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,

  -- Quando + o quê
  event_date date NOT NULL,
  start_time time NOT NULL,
  modality text NOT NULL,
  session_type text NOT NULL CHECK (session_type IN ('personal', 'group')),
  status public.attendance_event_status NOT NULL,

  -- Origem
  source public.attendance_event_source NOT NULL,
  source_id text NOT NULL,
  source_synced_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotência por origem
CREATE UNIQUE INDEX IF NOT EXISTS attendance_events_source_uq
  ON public.attendance_events(source, source_id);

-- Lookup do detector (por aluno + janela)
CREATE INDEX IF NOT EXISTS attendance_events_student_date_idx
  ON public.attendance_events(student_id, event_date DESC, start_time DESC);

-- Health-check / metrics (por status)
CREATE INDEX IF NOT EXISTS attendance_events_status_idx
  ON public.attendance_events(status, event_date DESC);

-- Operacional do sync (último upsert por origem)
CREATE INDEX IF NOT EXISTS attendance_events_source_synced_idx
  ON public.attendance_events(source, source_synced_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_attendance_events_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attendance_events_set_updated_at
  ON public.attendance_events;
CREATE TRIGGER attendance_events_set_updated_at
BEFORE UPDATE ON public.attendance_events
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_events_updated_at();

-- RLS
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY attendance_events_select_staff
    ON public.attendance_events
    FOR SELECT
    TO authenticated
    USING (
      public.has_role((select auth.uid()), 'admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'manager'::public.app_role)
      OR public.has_role((select auth.uid()), 'reception'::public.app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sem GRANT pra anon/authenticated — escrita só via service_role.

-- ─────────── 3. Tabela evo_student_mappings ───────────
CREATE TABLE IF NOT EXISTS public.evo_student_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evo_member_id text NOT NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  match_method public.evo_student_match_method NOT NULL DEFAULT 'unmatched',
  raw jsonb,
  evo_first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS evo_student_mappings_evo_uq
  ON public.evo_student_mappings(evo_member_id);

CREATE INDEX IF NOT EXISTS evo_student_mappings_student_idx
  ON public.evo_student_mappings(student_id)
  WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS evo_student_mappings_unmatched_idx
  ON public.evo_student_mappings(match_method)
  WHERE match_method = 'unmatched';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_evo_student_mappings_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS evo_student_mappings_set_updated_at
  ON public.evo_student_mappings;
CREATE TRIGGER evo_student_mappings_set_updated_at
BEFORE UPDATE ON public.evo_student_mappings
FOR EACH ROW EXECUTE FUNCTION public.set_evo_student_mappings_updated_at();

ALTER TABLE public.evo_student_mappings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY evo_student_mappings_select_staff
    ON public.evo_student_mappings
    FOR SELECT
    TO authenticated
    USING (
      public.has_role((select auth.uid()), 'admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'manager'::public.app_role)
      OR public.has_role((select auth.uid()), 'reception'::public.app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────── 4. Tabela evo_trainer_mappings ───────────
CREATE TABLE IF NOT EXISTS public.evo_trainer_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evo_employee_id text,
  evo_instructor_name text,
  trainer_id uuid REFERENCES public.trainers(id) ON DELETE CASCADE,
  match_method public.evo_trainer_match_method NOT NULL DEFAULT 'unmatched',
  raw jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Pelo menos um identificador EVO precisa estar setado
  CONSTRAINT evo_trainer_mappings_has_evo_key
    CHECK (evo_employee_id IS NOT NULL OR evo_instructor_name IS NOT NULL)
);

-- Unicidade de evo_employee_id (não-parcial; Postgres trata múltiplos
-- NULL como distintos, então linhas sem employee_id convivem). Índice
-- não-parcial é requisito pra `ON CONFLICT (evo_employee_id)` funcionar
-- no upsert do sync.
CREATE UNIQUE INDEX IF NOT EXISTS evo_trainer_mappings_employee_uq
  ON public.evo_trainer_mappings(evo_employee_id);

-- Unicidade de evo_instructor_name (mesmo motivo).
CREATE UNIQUE INDEX IF NOT EXISTS evo_trainer_mappings_name_uq
  ON public.evo_trainer_mappings(evo_instructor_name);

CREATE INDEX IF NOT EXISTS evo_trainer_mappings_trainer_idx
  ON public.evo_trainer_mappings(trainer_id)
  WHERE trainer_id IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_evo_trainer_mappings_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS evo_trainer_mappings_set_updated_at
  ON public.evo_trainer_mappings;
CREATE TRIGGER evo_trainer_mappings_set_updated_at
BEFORE UPDATE ON public.evo_trainer_mappings
FOR EACH ROW EXECUTE FUNCTION public.set_evo_trainer_mappings_updated_at();

ALTER TABLE public.evo_trainer_mappings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY evo_trainer_mappings_select_staff
    ON public.evo_trainer_mappings
    FOR SELECT
    TO authenticated
    USING (
      public.has_role((select auth.uid()), 'admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'manager'::public.app_role)
      OR public.has_role((select auth.uid()), 'reception'::public.app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────── 5. Grants explícitos ───────────
-- SELECT pra authenticated (RLS acima ainda gateia por papel).
-- INSERT/UPDATE/DELETE NÃO concedidos — escrita só via service_role.
GRANT SELECT ON public.attendance_events     TO authenticated;
GRANT SELECT ON public.evo_student_mappings  TO authenticated;
GRANT SELECT ON public.evo_trainer_mappings  TO authenticated;
