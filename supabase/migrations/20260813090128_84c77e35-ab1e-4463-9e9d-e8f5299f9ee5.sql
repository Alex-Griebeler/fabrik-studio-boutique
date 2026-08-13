DO $fix$
DECLARE
  v_op uuid := gen_random_uuid();
  v_tok uuid;
  r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"07c0184b-0f6a-4eef-99c8-128ab197f936","role":"authenticated"}', true);

  r := public.team_begin_operation(
    v_op, 'set_roles', NULL,
    'd7f51659-d1b3-4765-a972-a8c027216b57'::uuid,
    'felipe-miotto-somente-admin');

  v_tok := COALESCE((r ->> 'lease_token')::uuid, (r -> 'op' ->> 'lease_token')::uuid);

  PERFORM public.team_set_roles(v_op, v_tok, ARRAY['admin']::public.app_role[]);

  PERFORM public.team_finalize_operation(v_op, v_tok, 'succeeded', 'roles_set', NULL, NULL);
END
$fix$;

UPDATE public.profiles
SET full_name = 'Felipe Miotto'
WHERE lower(email) = 'felipemiottosa@gmail.com' AND btrim(full_name) = '';