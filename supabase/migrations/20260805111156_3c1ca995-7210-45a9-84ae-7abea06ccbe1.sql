REVOKE SELECT ON public.trainers FROM PUBLIC;
REVOKE SELECT ON public.trainers FROM authenticated;
REVOKE SELECT ON public.trainers FROM anon;

REVOKE SELECT (cpf, pix_key, pix_key_type, bank_name, bank_agency, bank_account, notes)
  ON public.trainers FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id, full_name, email, phone, bio, certifications, specialties,
  is_active, hired_at, terminated_at, profile_id,
  hourly_rate_main_cents, hourly_rate_assistant_cents,
  session_rate_cents, payment_method, created_at, updated_at
) ON public.trainers TO authenticated;

DO $chk$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'cpf', 'pix_key', 'pix_key_type', 'bank_name', 'bank_agency',
    'bank_account', 'notes'
  ] LOOP
    IF has_column_privilege('authenticated', 'public.trainers', col, 'SELECT') THEN
      RAISE EXCEPTION 'onda15a: authenticated ainda le trainers.%', col;
    END IF;
  END LOOP;

  IF has_any_column_privilege('anon', 'public.trainers', 'SELECT') THEN
    RAISE EXCEPTION 'onda15a: anon ainda le alguma coluna de trainers';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.trainers', 'full_name', 'SELECT') THEN
    RAISE EXCEPTION 'onda15a: coluna operacional full_name ficou inacessivel';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.trainers_admin', 'SELECT') THEN
    RAISE EXCEPTION 'onda15a: view trainers_admin inacessivel para authenticated';
  END IF;
END
$chk$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260804235000','onda15a_revoke_select_amplo')
ON CONFLICT DO NOTHING;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260804220721';