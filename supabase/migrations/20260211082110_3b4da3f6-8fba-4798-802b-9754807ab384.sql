
-- Drop existing bank policies if any
DROP POLICY IF EXISTS "bank_imports_select" ON public.bank_imports;
DROP POLICY IF EXISTS "bank_imports_insert" ON public.bank_imports;
DROP POLICY IF EXISTS "bank_imports_update" ON public.bank_imports;
DROP POLICY IF EXISTS "bank_imports_delete" ON public.bank_imports;
DROP POLICY IF EXISTS "bank_transactions_select" ON public.bank_transactions;
DROP POLICY IF EXISTS "bank_transactions_insert" ON public.bank_transactions;
DROP POLICY IF EXISTS "bank_transactions_update" ON public.bank_transactions;
DROP POLICY IF EXISTS "bank_transactions_delete" ON public.bank_transactions;

-- Enable RLS
ALTER TABLE public.bank_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- bank_imports policies
CREATE POLICY "bank_imports_select" ON public.bank_imports
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "bank_imports_insert" ON public.bank_imports
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "bank_imports_update" ON public.bank_imports
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "bank_imports_delete" ON public.bank_imports
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- bank_transactions policies
CREATE POLICY "bank_transactions_select" ON public.bank_transactions
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "bank_transactions_insert" ON public.bank_transactions
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "bank_transactions_update" ON public.bank_transactions
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "bank_transactions_delete" ON public.bank_transactions
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix students_select to restrict instructor access
DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'reception'::app_role)
    OR is_own_student(id)
    OR (
      has_role(auth.uid(), 'instructor'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.sessions s
        JOIN public.trainers t ON t.id = s.trainer_id
        WHERE s.student_id = students.id
          AND t.profile_id IN (
            SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid()
          )
      )
    )
  );
