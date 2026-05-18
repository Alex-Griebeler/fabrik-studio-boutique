-- Expose churn_alerts to authenticated app users.
-- RLS policies in 20260514190000_churn_alerts.sql still gate rows by role.
GRANT SELECT ON public.churn_alerts TO authenticated;
