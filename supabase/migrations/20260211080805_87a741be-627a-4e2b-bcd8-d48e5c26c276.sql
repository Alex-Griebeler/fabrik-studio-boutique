
-- ============================================================
-- CRM/Leads System: dedicated leads table + trial management
-- ============================================================

-- 1. Create leads table
CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  source text,
  status text NOT NULL DEFAULT 'new',
  qualification_score integer NOT NULL DEFAULT 0,
  qualification_details jsonb NOT NULL DEFAULT '{}',
  trial_date date,
  trial_time text,
  trial_type text,
  converted_to_student_id uuid REFERENCES public.students(id),
  lost_reason text,
  utm_params jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  referred_by uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Create trial_quotas table
CREATE TABLE public.trial_quotas (
  date date NOT NULL PRIMARY KEY,
  trials_booked integer NOT NULL DEFAULT 0,
  max_trials integer NOT NULL DEFAULT 4,
  occupied_hours jsonb NOT NULL DEFAULT '[]'
);

-- 3. Create trial_waitlist table
CREATE TABLE public.trial_waitlist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  preferred_dates date[],
  preferred_times text[],
  session_type_preference text NOT NULL DEFAULT 'any',
  position integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'waiting',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 4. Add lead_id to interactions
ALTER TABLE public.interactions
  ADD COLUMN lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;

-- 5. Triggers for updated_at
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Migrate existing leads from students to leads table
INSERT INTO public.leads (name, email, phone, source, status, notes, created_at, updated_at)
SELECT
  s.full_name,
  s.email,
  s.phone,
  s.lead_source,
  COALESCE(s.lead_stage, 'new'),
  s.notes,
  s.created_at,
  s.updated_at
FROM public.students s
WHERE s.status = 'lead';

-- 7. Migrate interactions: link to new lead_id where applicable
UPDATE public.interactions i
SET lead_id = l.id
FROM public.leads l
JOIN public.students s ON s.full_name = l.name AND s.status = 'lead'
WHERE i.student_id = s.id;

-- 8. Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_waitlist ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies for leads
CREATE POLICY "leads_select" ON public.leads FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'reception'::app_role) OR has_role(auth.uid(), 'instructor'::app_role));

CREATE POLICY "leads_insert" ON public.leads FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "leads_update" ON public.leads FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "leads_delete" ON public.leads FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 10. RLS Policies for trial_quotas
CREATE POLICY "trial_quotas_select" ON public.trial_quotas FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "trial_quotas_insert" ON public.trial_quotas FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "trial_quotas_update" ON public.trial_quotas FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "trial_quotas_delete" ON public.trial_quotas FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 11. RLS Policies for trial_waitlist
CREATE POLICY "trial_waitlist_select" ON public.trial_waitlist FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "trial_waitlist_insert" ON public.trial_waitlist FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "trial_waitlist_update" ON public.trial_waitlist FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'reception'::app_role));

CREATE POLICY "trial_waitlist_delete" ON public.trial_waitlist FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
