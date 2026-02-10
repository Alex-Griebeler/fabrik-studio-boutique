
-- =============================================
-- Sprint 5-6: Sessions & Trainers System
-- =============================================

-- 1. New enums
CREATE TYPE public.trainer_payment_method AS ENUM ('hourly', 'per_session', 'hybrid');
CREATE TYPE public.session_type AS ENUM ('personal', 'group');
CREATE TYPE public.full_session_status AS ENUM (
  'scheduled', 'cancelled_on_time', 'cancelled_late', 'no_show',
  'completed', 'disputed', 'adjusted', 'late_arrival'
);
CREATE TYPE public.makeup_credit_status AS ENUM ('available', 'used', 'expired');
CREATE TYPE public.checkin_method AS ENUM ('manual', 'qr_code', 'geolocation', 'auto');

-- =============================================
-- 2. POLICIES table (system configuration)
-- =============================================
CREATE TABLE public.policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policies_select" ON public.policies FOR SELECT USING (true);
CREATE POLICY "policies_insert" ON public.policies FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "policies_update" ON public.policies FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "policies_delete" ON public.policies FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_policies_updated_at BEFORE UPDATE ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default policies
INSERT INTO public.policies (key, value, description) VALUES
  ('personal_cancellation_cutoff_hours', '12', 'Horas mínimas de antecedência para cancelar sessão personal sem cobrança'),
  ('group_cancellation_cutoff_hours', '6', 'Horas mínimas de antecedência para cancelar sessão em grupo'),
  ('late_arrival_tolerance_minutes', '15', 'Minutos de tolerância para atraso do aluno'),
  ('makeup_credit_validity_days', '30', 'Dias de validade do crédito de reposição'),
  ('default_session_duration_minutes', '60', 'Duração padrão de sessão em minutos'),
  ('default_group_capacity', '12', 'Capacidade padrão de turma em grupo'),
  ('trainer_checkin_required', 'true', 'Se check-in do treinador é obrigatório para completar sessão'),
  ('student_checkin_required', 'true', 'Se check-in do aluno é obrigatório para completar sessão'),
  ('auto_complete_after_minutes', '30', 'Minutos após término para auto-completar sessão sem check-in');

-- =============================================
-- 3. TRAINERS table
-- =============================================
CREATE TABLE public.trainers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id),
  full_name text NOT NULL,
  email text,
  phone text,
  cpf text,
  
  -- Professional
  specialties text[] DEFAULT '{}',
  certifications text[] DEFAULT '{}',
  bio text,
  
  -- Rates
  payment_method trainer_payment_method NOT NULL DEFAULT 'hourly',
  hourly_rate_main_cents integer NOT NULL DEFAULT 0,
  hourly_rate_assistant_cents integer NOT NULL DEFAULT 0,
  session_rate_cents integer NOT NULL DEFAULT 0,
  
  -- Banking
  bank_name text,
  bank_agency text,
  bank_account text,
  pix_key text,
  pix_key_type text, -- cpf, email, phone, random
  
  -- Status
  is_active boolean NOT NULL DEFAULT true,
  hired_at date,
  terminated_at date,
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainers_select" ON public.trainers FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'instructor'::app_role) OR has_role(auth.uid(), 'reception'::app_role));
CREATE POLICY "trainers_insert" ON public.trainers FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "trainers_update" ON public.trainers FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "trainers_delete" ON public.trainers FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_trainers_updated_at BEFORE UPDATE ON public.trainers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 4. SESSIONS table (single source of truth)
-- =============================================
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Type & references
  session_type session_type NOT NULL DEFAULT 'group',
  modality text NOT NULL,
  student_id uuid REFERENCES public.students(id),
  contract_id uuid REFERENCES public.contracts(id),
  template_id uuid REFERENCES public.class_templates(id),
  
  -- Trainers
  trainer_id uuid REFERENCES public.trainers(id),
  assistant_trainer_id uuid REFERENCES public.trainers(id),
  
  -- Scheduling
  session_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  capacity integer NOT NULL DEFAULT 1,
  
  -- Financial snapshot (immutable once created)
  trainer_hourly_rate_cents integer DEFAULT 0,
  assistant_hourly_rate_cents integer DEFAULT 0,
  payment_hours numeric(5,2) DEFAULT 0,
  payment_amount_cents integer DEFAULT 0,
  assistant_payment_amount_cents integer DEFAULT 0,
  is_paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  
  -- Status
  status full_session_status NOT NULL DEFAULT 'scheduled',
  
  -- Check-in: trainer
  trainer_checkin_at timestamptz,
  trainer_checkin_method checkin_method,
  trainer_checkin_lat numeric(10,7),
  trainer_checkin_lng numeric(10,7),
  
  -- Check-in: student (personal sessions)
  student_checkin_at timestamptz,
  student_checkin_method checkin_method,
  student_checkin_lat numeric(10,7),
  student_checkin_lng numeric(10,7),
  
  -- Cancellation
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text,
  cancellation_within_cutoff boolean,
  
  -- Late arrival
  actual_start_time time,
  late_minutes integer DEFAULT 0,
  
  -- Dispute / audit
  disputed_at timestamptz,
  disputed_by uuid,
  dispute_reason text,
  dispute_resolution text,
  resolved_at timestamptz,
  resolved_by uuid,
  
  -- Adjustment
  original_payment_amount_cents integer,
  adjustment_reason text,
  adjusted_by uuid,
  adjusted_at timestamptz,
  
  -- Metadata
  notes text,
  is_exception boolean NOT NULL DEFAULT false,
  is_makeup boolean NOT NULL DEFAULT false,
  makeup_credit_id uuid,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_select" ON public.sessions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'instructor'::app_role) OR has_role(auth.uid(), 'reception'::app_role));
CREATE POLICY "sessions_insert" ON public.sessions FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'instructor'::app_role));
CREATE POLICY "sessions_update" ON public.sessions FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'instructor'::app_role));
CREATE POLICY "sessions_delete" ON public.sessions FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Optimized indexes
CREATE INDEX idx_sessions_date ON public.sessions (session_date);
CREATE INDEX idx_sessions_trainer ON public.sessions (trainer_id, session_date);
CREATE INDEX idx_sessions_student ON public.sessions (student_id, session_date);
CREATE INDEX idx_sessions_status ON public.sessions (status);
CREATE INDEX idx_sessions_payroll ON public.sessions (trainer_id, status, is_paid, session_date);
CREATE INDEX idx_sessions_template ON public.sessions (template_id, session_date);

-- =============================================
-- 5. MAKEUP_CREDITS table
-- =============================================
CREATE TABLE public.makeup_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id),
  contract_id uuid REFERENCES public.contracts(id),
  original_session_id uuid REFERENCES public.sessions(id),
  used_session_id uuid REFERENCES public.sessions(id),
  
  status makeup_credit_status NOT NULL DEFAULT 'available',
  expires_at timestamptz,
  used_at timestamptz,
  
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.makeup_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "makeup_credits_select" ON public.makeup_credits FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'instructor'::app_role) OR has_role(auth.uid(), 'reception'::app_role));
CREATE POLICY "makeup_credits_insert" ON public.makeup_credits FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "makeup_credits_update" ON public.makeup_credits FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "makeup_credits_delete" ON public.makeup_credits FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_makeup_credits_updated_at BEFORE UPDATE ON public.makeup_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add FK from sessions back to makeup_credits
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_makeup_credit_id_fkey
  FOREIGN KEY (makeup_credit_id) REFERENCES public.makeup_credits(id);

-- =============================================
-- 6. Trigger to auto-expire makeup credits
-- =============================================
CREATE OR REPLACE FUNCTION public.expire_makeup_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.makeup_credits
  SET status = 'expired', updated_at = now()
  WHERE status = 'available'
    AND expires_at IS NOT NULL
    AND expires_at < now();
  RETURN NULL;
END;
$$;

-- Run expiration check on every insert to makeup_credits (lightweight)
CREATE TRIGGER trg_expire_makeup_credits
  AFTER INSERT ON public.makeup_credits
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.expire_makeup_credits();

-- =============================================
-- 7. VIEW: payable_sessions (for Sprint 7 payroll)
-- =============================================
CREATE OR REPLACE VIEW public.payable_sessions AS
SELECT
  s.id,
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
WHERE s.status IN ('completed', 'cancelled_late', 'no_show', 'late_arrival');

-- =============================================
-- 8. Migrate existing class_sessions data
-- =============================================
INSERT INTO public.sessions (
  session_type, modality, template_id, session_date, start_time, end_time,
  duration_minutes, capacity, status, notes, is_exception, created_at, updated_at
)
SELECT
  'group'::session_type,
  cs.modality,
  cs.template_id,
  cs.session_date,
  cs.start_time,
  (cs.start_time + (cs.duration_minutes || ' minutes')::interval)::time,
  cs.duration_minutes,
  cs.capacity,
  CASE cs.status
    WHEN 'scheduled' THEN 'scheduled'::full_session_status
    WHEN 'cancelled' THEN 'cancelled_on_time'::full_session_status
    WHEN 'completed' THEN 'completed'::full_session_status
  END,
  cs.notes,
  cs.is_exception,
  cs.created_at,
  cs.updated_at
FROM public.class_sessions cs;
