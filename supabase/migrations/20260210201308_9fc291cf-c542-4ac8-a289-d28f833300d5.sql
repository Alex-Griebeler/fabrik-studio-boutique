
-- Expense categories table
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  color text NOT NULL DEFAULT 'gray',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_categories_select" ON public.expense_categories
  FOR SELECT USING (true);

CREATE POLICY "expense_categories_insert" ON public.expense_categories
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "expense_categories_update" ON public.expense_categories
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "expense_categories_delete" ON public.expense_categories
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_expense_categories_updated_at
  BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Expense status enum
CREATE TYPE public.expense_status AS ENUM ('pending', 'paid', 'cancelled');

-- Expenses table
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.expense_categories(id) NOT NULL,
  description text NOT NULL,
  amount_cents integer NOT NULL,
  due_date date NOT NULL,
  payment_date date,
  status public.expense_status NOT NULL DEFAULT 'pending',
  payment_method public.payment_method,
  recurrence text CHECK (recurrence IN ('none', 'monthly', 'weekly', 'yearly')) DEFAULT 'none',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_select" ON public.expenses
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "expenses_insert" ON public.expenses
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "expenses_update" ON public.expenses
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "expenses_delete" ON public.expenses
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default expense categories
INSERT INTO public.expense_categories (name, slug, color, sort_order) VALUES
  ('Aluguel', 'aluguel', 'blue', 1),
  ('Salários', 'salarios', 'green', 2),
  ('Equipamentos', 'equipamentos', 'orange', 3),
  ('Marketing', 'marketing', 'purple', 4),
  ('Utilidades', 'utilidades', 'yellow', 5),
  ('Manutenção', 'manutencao', 'red', 6),
  ('Impostos', 'impostos', 'gray', 7),
  ('Outros', 'outros', 'slate', 8);
