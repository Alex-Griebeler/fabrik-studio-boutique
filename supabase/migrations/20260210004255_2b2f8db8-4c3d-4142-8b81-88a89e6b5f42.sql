
-- Enum for class modalities
CREATE TYPE public.class_modality AS ENUM ('btb', 'hiit', 'personal', 'pilates', 'recovery');

-- Enum for session status
CREATE TYPE public.session_status AS ENUM ('scheduled', 'cancelled', 'completed');

-- Enum for booking status
CREATE TYPE public.booking_status AS ENUM ('confirmed', 'cancelled', 'waitlist', 'no_show');

-- Weekly recurring templates
CREATE TABLE public.class_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  modality public.class_modality NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  capacity INTEGER NOT NULL DEFAULT 12,
  instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual class sessions (from template or ad-hoc)
CREATE TABLE public.class_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES public.class_templates(id) ON DELETE SET NULL,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  modality public.class_modality NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 12,
  instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status public.session_status NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Student bookings for sessions
CREATE TABLE public.class_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.class_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status public.booking_status NOT NULL DEFAULT 'confirmed',
  booked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  UNIQUE(session_id, student_id)
);

-- Enable RLS
ALTER TABLE public.class_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_bookings ENABLE ROW LEVEL SECURITY;

-- class_templates policies
CREATE POLICY "class_templates_select" ON public.class_templates FOR SELECT
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'instructor') OR has_role(auth.uid(), 'reception'));

CREATE POLICY "class_templates_insert" ON public.class_templates FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "class_templates_update" ON public.class_templates FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "class_templates_delete" ON public.class_templates FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- class_sessions policies
CREATE POLICY "class_sessions_select" ON public.class_sessions FOR SELECT
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'instructor') OR has_role(auth.uid(), 'reception'));

CREATE POLICY "class_sessions_insert" ON public.class_sessions FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'instructor'));

CREATE POLICY "class_sessions_update" ON public.class_sessions FOR UPDATE
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'instructor'));

CREATE POLICY "class_sessions_delete" ON public.class_sessions FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- class_bookings policies
CREATE POLICY "class_bookings_select" ON public.class_bookings FOR SELECT
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'instructor') OR has_role(auth.uid(), 'reception'));

CREATE POLICY "class_bookings_insert" ON public.class_bookings FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'instructor') OR has_role(auth.uid(), 'reception'));

CREATE POLICY "class_bookings_update" ON public.class_bookings FOR UPDATE
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'instructor') OR has_role(auth.uid(), 'reception'));

CREATE POLICY "class_bookings_delete" ON public.class_bookings FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- Updated_at triggers
CREATE TRIGGER update_class_templates_updated_at
  BEFORE UPDATE ON public.class_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_class_sessions_updated_at
  BEFORE UPDATE ON public.class_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
