
-- Add recurrence fields to class_templates
ALTER TABLE public.class_templates
  ADD COLUMN recurrence_start date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN recurrence_end date NULL; -- NULL = indefinido

-- Add a flag to class_sessions to mark individually edited sessions
-- so recurring edits know to skip them
ALTER TABLE public.class_sessions
  ADD COLUMN is_exception boolean NOT NULL DEFAULT false;
