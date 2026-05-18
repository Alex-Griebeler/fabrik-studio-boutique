GRANT UPDATE (status, acknowledged_at, resolved_at)
  ON public.churn_alerts
  TO authenticated;

DO $$ BEGIN
  CREATE POLICY churn_alerts_update_staff
    ON public.churn_alerts
    FOR UPDATE
    TO authenticated
    USING (
      status = 'open'
      AND EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'manager', 'reception')
      )
    )
    WITH CHECK (
      status IN ('acknowledged', 'resolved', 'suppressed')
      AND EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'manager', 'reception')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;