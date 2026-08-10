-- Fixture mínimo de contrato de produção para os testes da Onda 2c
-- (conciliação bancária). Usado só pelo GitHub Actions em projeto efêmero.
--
-- As tabelas bancárias NUNCA tiveram migration de criação no repo (nasceram
-- no builder do Lovable) — este fixture é o baseline versionado delas
-- (requisito F1 do plano 2c v5) e deve crescer junto com as PRs da onda.
-- Shape copiado de src/integrations/supabase/types.ts + policies da
-- migration 20260211082110 (estado real de produção em 09/08/2026).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Contrato da nuvem: tabelas novas nascem concedidas a todos os roles de API.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'instructor', 'student', 'manager', 'reception');

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);

-- has_role como em produção desde 08/08: self-only + boolean estrito.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    auth.uid() = _user_id
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    ),
    false)
$function$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;

-- ── bank_imports (shape de produção; colunas de tipos.ts em 1c0c71f) ──
CREATE TABLE public.bank_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_url text,
  file_hash text,
  bank_id text,
  account_id text,
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'processing',
  total_transactions integer,
  total_credits_cents bigint,
  total_debits_cents bigint,
  error_message text,
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── bank_transactions (shape de produção) ──
CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.bank_imports(id),
  fit_id text NOT NULL,
  transaction_type text NOT NULL,
  posted_date date NOT NULL,
  amount_cents bigint NOT NULL,
  memo text NOT NULL,
  parsed_type text,
  parsed_name text,
  parsed_document text,
  is_balance_entry boolean DEFAULT false,
  match_status text NOT NULL DEFAULT 'unmatched',
  match_confidence text,
  matched_invoice_id uuid,
  matched_expense_id uuid,
  matched_at timestamptz,
  matched_by uuid,
  processor_fee_cents integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_transactions_match_status ON public.bank_transactions (match_status);

-- ── RLS como em produção (migration 20260211082110) ──
ALTER TABLE public.bank_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_imports_select" ON public.bank_imports
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "bank_imports_insert" ON public.bank_imports
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "bank_imports_update" ON public.bank_imports
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "bank_imports_delete" ON public.bank_imports
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "bank_transactions_select" ON public.bank_transactions
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "bank_transactions_insert" ON public.bank_transactions
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "bank_transactions_update" ON public.bank_transactions
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "bank_transactions_delete" ON public.bank_transactions
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- ── Linhas representativas: os "6 imports legados" de produção em miniatura ──
INSERT INTO public.bank_imports (id, file_name, file_type, file_hash, status, total_transactions)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Extrato_legado.ofx', 'ofx', 'hash-legado-1', 'completed', 2),
  ('22222222-2222-2222-2222-222222222222', 'Fatura_legada.xlsx', 'xlsx', 'hash-legado-2', 'completed', 1);

INSERT INTO public.bank_transactions (import_id, fit_id, transaction_type, posted_date, amount_cents, memo)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'fit-1', 'debit', '2026-03-02', -15000, 'PIX ENVIADO FORNECEDOR'),
  ('11111111-1111-1111-1111-111111111111', 'fit-2', 'credit', '2026-03-03', 9700, 'CRED REDE LOJA'),
  ('22222222-2222-2222-2222-222222222222', 'fit-3', 'debit', '2026-01-21', -3500, 'COMPRA CARTAO');
