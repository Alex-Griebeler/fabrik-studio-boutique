GRANT SELECT ON public.attendance_alerts TO authenticated;

REVOKE UPDATE ON public.attendance_alerts FROM anon;
REVOKE UPDATE ON public.attendance_alerts FROM authenticated;

GRANT UPDATE (
  status,
  acknowledged_at,
  acknowledged_via,
  resolved_at,
  resolved_by
) ON public.attendance_alerts TO authenticated;

DROP POLICY IF EXISTS attendance_alerts_update_staff
  ON public.attendance_alerts;

CREATE POLICY attendance_alerts_update_staff
  ON public.attendance_alerts
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'manager'::public.app_role)
    OR public.has_role((select auth.uid()), 'reception'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'manager'::public.app_role)
    OR public.has_role((select auth.uid()), 'reception'::public.app_role)
  );