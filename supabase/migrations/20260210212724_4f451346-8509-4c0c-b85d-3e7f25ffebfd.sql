
-- Add parent_id to expense_categories for 2-level hierarchy (group → subcategory)
ALTER TABLE public.expense_categories
ADD COLUMN parent_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL;

-- Index for efficient lookups
CREATE INDEX idx_expense_categories_parent_id ON public.expense_categories(parent_id);
