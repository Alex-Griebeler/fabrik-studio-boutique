-- Link manually-created follow-up tasks back to the churn alert that
-- originated them. This is audit-only: no automation or trigger is added.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS churn_alert_id uuid
  REFERENCES public.churn_alerts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_churn_alert_id_idx
  ON public.tasks(churn_alert_id);

-- Allow staff to create manual churn follow-up tasks for the alert's
-- own student. This is intentionally narrower than a general tasks
-- insert policy and does not allow updates/deletes.
DO $$ BEGIN
  CREATE POLICY tasks_insert_churn_followup_staff
    ON public.tasks
    FOR INSERT
    TO authenticated
    WITH CHECK (
      churn_alert_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'manager', 'reception')
      )
      AND EXISTS (
        SELECT 1
        FROM public.churn_alerts ca
        WHERE ca.id = tasks.churn_alert_id
          AND ca.student_id = tasks.student_id
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
