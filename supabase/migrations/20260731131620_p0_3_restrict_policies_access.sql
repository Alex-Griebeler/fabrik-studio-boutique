-- P0-3a: close the public Data API surface of public.policies.
--
-- Runtime evidence (2026-07-30) showed SELECT TO public USING (true) and
-- broad table grants. The table contains internal operating parameters,
-- including attendance routing configuration. The admin-only /settings route
-- needs the business-rule rows; the schedule cancellation dialog also needs
-- only the two cancellation cutoffs for operational staff. Edge Functions use
-- service_role and are intentionally left untouched.

REVOKE ALL PRIVILEGES ON TABLE public.policies
  FROM PUBLIC, anon, authenticated;

-- Make the server-side dependency explicit instead of relying on inherited or
-- project-default privileges.
GRANT SELECT ON TABLE public.policies TO service_role;

-- The admin settings screen only reads and updates existing rows.
GRANT SELECT, UPDATE ON TABLE public.policies TO authenticated;

DROP POLICY IF EXISTS "policies_select" ON public.policies;
DROP POLICY IF EXISTS "policies_insert" ON public.policies;
DROP POLICY IF EXISTS "policies_update" ON public.policies;
DROP POLICY IF EXISTS "policies_delete" ON public.policies;
DROP POLICY IF EXISTS "policies_select_admin" ON public.policies;
DROP POLICY IF EXISTS "policies_select_operational_cutoffs" ON public.policies;
DROP POLICY IF EXISTS "policies_update_admin" ON public.policies;

CREATE POLICY "policies_select_admin"
ON public.policies
FOR SELECT
TO authenticated
USING (
  (SELECT auth.uid()) IS NOT NULL
  AND public.has_role(
    (SELECT auth.uid()),
    'admin'::public.app_role
  )
);

CREATE POLICY "policies_select_operational_cutoffs"
ON public.policies
FOR SELECT
TO authenticated
USING (
  key IN (
    'personal_cancellation_cutoff_hours',
    'group_cancellation_cutoff_hours'
  )
  AND (
    public.has_role(
      (SELECT auth.uid()),
      'manager'::public.app_role
    )
    OR public.has_role(
      (SELECT auth.uid()),
      'instructor'::public.app_role
    )
    OR public.has_role(
      (SELECT auth.uid()),
      'reception'::public.app_role
    )
  )
);

CREATE POLICY "policies_update_admin"
ON public.policies
FOR UPDATE
TO authenticated
USING (
  (SELECT auth.uid()) IS NOT NULL
  AND public.has_role(
    (SELECT auth.uid()),
    'admin'::public.app_role
  )
)
WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL
  AND public.has_role(
    (SELECT auth.uid()),
    'admin'::public.app_role
  )
);
