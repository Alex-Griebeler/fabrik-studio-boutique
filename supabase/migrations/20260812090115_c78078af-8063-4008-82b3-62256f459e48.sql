SELECT set_config('request.jwt.claims', '{"sub":"07c0184b-0f6a-4eef-99c8-128ab197f936","role":"authenticated"}', false);
WITH retomada AS (
  SELECT public.team_begin_operation(
    'c32ea7e0-fe18-44ed-883e-0427cba2fe9c'::uuid, 'set_roles', NULL,
    'd7f51659-d1b3-4765-a972-a8c027216b57'::uuid, 'p0-felipe-instructor') AS r
)
SELECT public.team_finalize_operation(
  'c32ea7e0-fe18-44ed-883e-0427cba2fe9c'::uuid,
  ((SELECT r FROM retomada) ->> 'lease_token')::uuid,
  'succeeded', 'roles_set', NULL, NULL);

WITH op AS (
  SELECT public.team_begin_operation(
    gen_random_uuid(), 'set_roles', NULL,
    'd7f51659-d1b3-4765-a972-a8c027216b57'::uuid, 'felipe-admin-mais-instructor') AS r
)
SELECT public.team_set_roles(
  ((SELECT r FROM op) -> 'op' ->> 'operation_id')::uuid,
  ((SELECT r FROM op) ->> 'lease_token')::uuid,
  ARRAY['admin','instructor']::public.app_role[]);

WITH o AS (
  SELECT operation_id, lease_token FROM public.team_operations
  WHERE payload_fingerprint = 'felipe-admin-mais-instructor' AND status = 'started'
)
SELECT public.team_finalize_operation(
  (SELECT operation_id FROM o), (SELECT lease_token FROM o),
  'succeeded', 'roles_set', NULL, NULL);