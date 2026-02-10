
-- 1. Role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'instructor', 'student');

-- 2. Plan enums
CREATE TYPE public.plan_category AS ENUM (
  'grupos_adultos', 'renovacao_grupos_adultos', 'plano_30_dias',
  'sessoes_avulsas_adultos', 'planos_70_plus', 'planos_adolescentes',
  'sessoes_avulsas_adolescentes', 'personal', 'renovacao_personal',
  'alex_griebeler_individual', 'alex_griebeler_small_group'
);

CREATE TYPE public.plan_duration AS ENUM ('anual', 'semestral', 'trimestral', 'mensal', 'avulso', 'unico');

CREATE TYPE public.contract_status AS ENUM ('active', 'suspended', 'cancelled', 'expired');

CREATE TYPE public.invoice_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled');

-- 3. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 5. Students table
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  cpf TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Plans table
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category public.plan_category NOT NULL,
  frequency TEXT,
  duration public.plan_duration NOT NULL,
  price_cents INTEGER NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  validity_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Contracts table
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE,
  status public.contract_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Invoices table
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  due_date DATE NOT NULL,
  payment_date DATE,
  status public.invoice_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- 10. Helper function: has_role (SECURITY DEFINER to avoid recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 11. Helper: is_own_profile
CREATE OR REPLACE FUNCTION public.is_own_profile(_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _profile_id AND auth_user_id = auth.uid()
  )
$$;

-- 12. Helper: is_own_student (student linked to user's profile)
CREATE OR REPLACE FUNCTION public.is_own_student(_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE s.id = _student_id AND p.auth_user_id = auth.uid()
  )
$$;

-- 13. Helper: is_own_contract
CREATE OR REPLACE FUNCTION public.is_own_contract(_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
    JOIN public.students s ON s.id = c.student_id
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE c.id = _contract_id AND p.auth_user_id = auth.uid()
  )
$$;

-- 14. Helper: is_own_invoice
CREATE OR REPLACE FUNCTION public.is_own_invoice(_invoice_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.contracts c ON c.id = i.contract_id
    JOIN public.students s ON s.id = c.student_id
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE i.id = _invoice_id AND p.auth_user_id = auth.uid()
  )
$$;

-- 15. Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 16. Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 17. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  -- Default role: admin (for first users; adjust as needed)
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 18. RLS Policies: profiles
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'instructor') OR auth_user_id = auth.uid());

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR auth_user_id = auth.uid());

CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 19. RLS Policies: user_roles
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "user_roles_insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_update" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_delete" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 20. RLS Policies: students
CREATE POLICY "students_select" ON public.students FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'instructor') OR public.is_own_student(id));

CREATE POLICY "students_insert" ON public.students FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "students_update" ON public.students FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_own_student(id));

CREATE POLICY "students_delete" ON public.students FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 21. RLS Policies: plans (readable by all authenticated)
CREATE POLICY "plans_select" ON public.plans FOR SELECT TO authenticated USING (true);

CREATE POLICY "plans_insert" ON public.plans FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "plans_update" ON public.plans FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "plans_delete" ON public.plans FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 22. RLS Policies: contracts
CREATE POLICY "contracts_select" ON public.contracts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'instructor') OR public.is_own_contract(id));

CREATE POLICY "contracts_insert" ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "contracts_update" ON public.contracts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "contracts_delete" ON public.contracts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 23. RLS Policies: invoices
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_own_invoice(id));

CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 24. Indexes
CREATE INDEX idx_profiles_auth_user_id ON public.profiles(auth_user_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_students_profile_id ON public.students(profile_id);
CREATE INDEX idx_contracts_student_id ON public.contracts(student_id);
CREATE INDEX idx_contracts_plan_id ON public.contracts(plan_id);
CREATE INDEX idx_invoices_contract_id ON public.invoices(contract_id);
CREATE INDEX idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX idx_invoices_status ON public.invoices(status);
