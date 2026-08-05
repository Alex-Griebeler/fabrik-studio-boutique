-- 1. Fix mutable search_path
CREATE OR REPLACE FUNCTION public.set_churn_alerts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NULL;
END $function$;

-- keep original behaviour (BEFORE UPDATE row trigger must return NEW)
CREATE OR REPLACE FUNCTION public.set_churn_alerts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $function$;

-- 2. Revoke direct EXECUTE on trigger functions from client roles
REVOKE EXECUTE ON FUNCTION public.auto_create_first_contact_task() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_create_lead_task() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_create_rescue_task() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_create_trial_reminder_task() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_start_nurturing_sequence() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_overdue_on_access() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_makeup_credits() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_log() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_attendance_alerts_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_attendance_events_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_churn_alerts_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_evo_student_mappings_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_evo_trainer_mappings_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;

-- 3. Helper predicates: only signed-in users need them (used inside RLS policies)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_own_contract(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_own_invoice(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_own_profile(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_own_student(uuid) FROM anon;

-- 4. Restrict plans catalog reads
DROP POLICY IF EXISTS plans_select ON public.plans;

CREATE POLICY plans_select_staff
ON public.plans
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'reception'::public.app_role)
  OR public.has_role(auth.uid(), 'instructor'::public.app_role)
);

CREATE POLICY plans_select_own_contract
ON public.plans
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.contracts c
    JOIN public.students s ON s.id = c.student_id
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE c.plan_id = plans.id
      AND p.auth_user_id = auth.uid()
  )
);