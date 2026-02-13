
-- Table for keyword-based expense categorization rules
CREATE TABLE public.expense_category_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.expense_categories(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint on keyword to avoid duplicates
CREATE UNIQUE INDEX idx_expense_category_rules_keyword ON public.expense_category_rules (lower(keyword));

-- Index for fast lookup
CREATE INDEX idx_expense_category_rules_active ON public.expense_category_rules (is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.expense_category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_category_rules_select" ON public.expense_category_rules FOR SELECT USING (true);
CREATE POLICY "expense_category_rules_insert" ON public.expense_category_rules FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "expense_category_rules_update" ON public.expense_category_rules FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "expense_category_rules_delete" ON public.expense_category_rules FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_expense_category_rules_updated_at
  BEFORE UPDATE ON public.expense_category_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed some common rules (user can customize later)
INSERT INTO public.expense_category_rules (keyword, category_id, priority) 
SELECT keyword, cat.id, priority
FROM (VALUES 
  ('NETFLIX', 'assinaturas', 10),
  ('SPOTIFY', 'assinaturas', 10),
  ('AMAZON', 'assinaturas', 5),
  ('GOOGLE', 'tecnologia', 5),
  ('UBER', 'transporte', 10),
  ('99', 'transporte', 5),
  ('ENEL', 'energia', 10),
  ('CPFL', 'energia', 10),
  ('SABESP', 'agua', 10),
  ('CLARO', 'telecomunicacoes', 10),
  ('VIVO', 'telecomunicacoes', 10),
  ('TIM', 'telecomunicacoes', 5)
) AS rules(keyword, slug, priority)
JOIN public.expense_categories cat ON cat.slug = rules.slug
WHERE cat.is_active = true;
