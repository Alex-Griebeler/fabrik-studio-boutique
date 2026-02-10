
-- 1. Add new roles: manager, reception
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'reception';

-- 2. Add student_status enum
CREATE TYPE public.student_status AS ENUM ('lead', 'active', 'inactive', 'suspended');

-- 3. Add payment_method enum
CREATE TYPE public.payment_method AS ENUM ('pix', 'credit_card', 'debit_card', 'boleto', 'cash', 'transfer');

-- 4. Expand students table
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS address jsonb,
  ADD COLUMN IF NOT EXISTS medical_conditions text,
  ADD COLUMN IF NOT EXISTS status public.student_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.students(id),
  ADD COLUMN IF NOT EXISTS profile_photo_url text;

-- 5. Expand contracts table
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS total_value_cents integer,
  ADD COLUMN IF NOT EXISTS monthly_value_cents integer,
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method,
  ADD COLUMN IF NOT EXISTS payment_day integer,
  ADD COLUMN IF NOT EXISTS discount_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- 6. Expand invoices table
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id),
  ADD COLUMN IF NOT EXISTS reference_month text,
  ADD COLUMN IF NOT EXISTS paid_amount_cents integer,
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method,
  ADD COLUMN IF NOT EXISTS payment_proof_url text;
