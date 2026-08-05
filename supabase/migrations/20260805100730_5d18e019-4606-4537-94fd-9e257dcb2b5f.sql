-- Trigger-only functions: no direct callers
REVOKE ALL ON FUNCTION public.auto_create_first_contact_task() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_create_lead_task() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_create_rescue_task() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_create_trial_reminder_task() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_start_nurturing_sequence() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_overdue_on_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_makeup_credits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_audit_log() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_attendance_alerts_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_attendance_events_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_churn_alerts_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_evo_student_mappings_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_evo_trainer_mappings_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Predicate helpers used by RLS policies: signed-in users + backend only
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_own_contract(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_own_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_own_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_own_student(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_own_contract(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_own_invoice(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_own_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_own_student(uuid) TO authenticated, service_role;

-- Public anamnese form RPC: keep intentional anonymous access
REVOKE ALL ON FUNCTION public.update_lead_anamnese(uuid, text, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_lead_anamnese(uuid, text, jsonb, text, text, text) TO anon, authenticated, service_role;