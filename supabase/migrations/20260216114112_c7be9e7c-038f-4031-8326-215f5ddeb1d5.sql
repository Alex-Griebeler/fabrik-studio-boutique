
-- ============================================
-- FASE 1: Infraestrutura de Dados
-- ============================================

-- 1.1 Tabela bank_accounts
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bank_code text,
  bank_name text,
  branch text,
  account_number text,
  pix_key text,
  is_active boolean NOT NULL DEFAULT true,
  current_balance_cents bigint NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_accounts_admin_full" ON public.bank_accounts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "bank_accounts_manager_select" ON public.bank_accounts FOR SELECT
  USING (has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 1.2 Tabela suppliers
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  cnpj text,
  email text,
  phone text,
  pix_key text,
  bank_name text,
  bank_branch text,
  bank_account text,
  payment_terms text,
  contact_name text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_admin_full" ON public.suppliers FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "suppliers_manager_select" ON public.suppliers FOR SELECT
  USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "suppliers_reception_select" ON public.suppliers FOR SELECT
  USING (has_role(auth.uid(), 'reception'::app_role));

CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 1.3 Novos campos em invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS fine_amount_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_amount_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS competence_date date;

-- 1.4 Novos campos em expenses
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id),
  ADD COLUMN IF NOT EXISTS competence_date date,
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_frequency text DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS recurring_until date,
  ADD COLUMN IF NOT EXISTS parent_expense_id uuid REFERENCES public.expenses(id);

-- 1.5 Campo processor_fee_cents em bank_transactions
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS processor_fee_cents integer DEFAULT 0;

-- 1.6 Tabela audit_log
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_admin_select" ON public.audit_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Audit trigger function
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'insert', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Audit triggers
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER audit_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER audit_contracts
  AFTER INSERT OR UPDATE OR DELETE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER audit_bank_transactions
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- 1.7 Indices de performance
CREATE INDEX IF NOT EXISTS idx_invoices_due_date_status ON public.invoices (due_date, status);
CREATE INDEX IF NOT EXISTS idx_invoices_student_id ON public.invoices (student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_competence_date ON public.invoices (competence_date);
CREATE INDEX IF NOT EXISTS idx_expenses_due_date_status ON public.expenses (due_date, status);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON public.expenses (category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier_id ON public.expenses (supplier_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_match_status ON public.bank_transactions (match_status);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_posted_date ON public.bank_transactions (posted_date);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON public.audit_log (table_name, record_id);
