
-- Interaction type enum
CREATE TYPE public.interaction_type AS ENUM (
  'phone_call', 'whatsapp', 'email', 'visit', 'trial_class', 'follow_up', 'note'
);

-- Interactions table for CRM
CREATE TABLE public.interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  type public.interaction_type NOT NULL,
  description text NOT NULL,
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interactions_select" ON public.interactions
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'instructor'::app_role)
    OR has_role(auth.uid(), 'reception'::app_role)
  );

CREATE POLICY "interactions_insert" ON public.interactions
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'reception'::app_role)
  );

CREATE POLICY "interactions_update" ON public.interactions
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'reception'::app_role)
  );

CREATE POLICY "interactions_delete" ON public.interactions
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_interactions_updated_at
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add a lead_stage column to students for kanban positioning
ALTER TABLE public.students
  ADD COLUMN lead_stage text DEFAULT 'new'
  CHECK (lead_stage IN ('new', 'contacted', 'trial', 'negotiation', 'converted', 'lost'));
