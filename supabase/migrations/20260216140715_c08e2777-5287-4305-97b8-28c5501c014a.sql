
-- 1. Add new values to payment_method enum
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'dcc';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'card_machine';

-- 2. Add 'scheduled' to invoice_status enum
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'scheduled';

-- 3. New columns on contracts
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS installments integer;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS total_paid_cents integer DEFAULT 0;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS card_last_four text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS card_brand text;

-- 4. New columns on invoices (cobranças)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_type text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS installment_number integer;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS total_installments integer;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS scheduled_date date;
