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

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.is_own_student(uuid) TO anon;

DO $check$
BEGIN
  IF NOT has_function_privilege('anon','public.has_role(uuid, public.app_role)','EXECUTE') THEN
    RAISE EXCEPTION 'pós: anon segue sem EXECUTE em has_role';
  END IF;
  IF NOT has_function_privilege('anon','public.is_own_student(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'pós: anon segue sem EXECUTE em is_own_student';
  END IF;
  IF NOT has_function_privilege('authenticated','public.has_role(uuid, public.app_role)','EXECUTE') THEN
    RAISE EXCEPTION 'pós: authenticated perdeu EXECUTE em has_role';
  END IF;
  IF position('auth.uid() = _user_id' IN pg_get_functiondef('public.has_role(uuid, public.app_role)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'pós: corpo endurecido não aplicado';
  END IF;
  RAISE NOTICE 'fix ok: has_role endurecida (self-only, boolean estrito) + EXECUTE devolvido ao anon (has_role, is_own_student).';
END
$check$;