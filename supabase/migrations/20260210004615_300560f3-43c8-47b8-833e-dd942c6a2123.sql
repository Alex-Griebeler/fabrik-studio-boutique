
-- Create dynamic modalities table
CREATE TABLE public.class_modalities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'primary',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed existing modalities
INSERT INTO public.class_modalities (name, slug, color, sort_order) VALUES
  ('BTB', 'btb', 'primary', 1),
  ('HIIT', 'hiit', 'destructive', 2),
  ('Personal', 'personal', 'info', 3),
  ('Pilates', 'pilates', 'success', 4),
  ('Recovery', 'recovery', 'warning', 5);

-- Alter class_templates: drop enum, use text
ALTER TABLE public.class_templates ALTER COLUMN modality TYPE TEXT USING modality::TEXT;

-- Alter class_sessions: drop enum, use text
ALTER TABLE public.class_sessions ALTER COLUMN modality TYPE TEXT USING modality::TEXT;

-- Drop the enum type (no longer needed)
DROP TYPE public.class_modality;

-- Enable RLS
ALTER TABLE public.class_modalities ENABLE ROW LEVEL SECURITY;

-- Everyone can read modalities
CREATE POLICY "class_modalities_select" ON public.class_modalities FOR SELECT USING (true);
CREATE POLICY "class_modalities_insert" ON public.class_modalities FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "class_modalities_update" ON public.class_modalities FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "class_modalities_delete" ON public.class_modalities FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Trigger
CREATE TRIGGER update_class_modalities_updated_at
  BEFORE UPDATE ON public.class_modalities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
