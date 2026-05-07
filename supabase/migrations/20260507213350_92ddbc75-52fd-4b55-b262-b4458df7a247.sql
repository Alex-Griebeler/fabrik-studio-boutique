CREATE OR REPLACE FUNCTION public._smoke_test_detect_attendance()
RETURNS TABLE(request_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_url text := 'https://hcfzqeutssngprldtymo.supabase.co/functions/v1/detect-attendance-risk';
  v_key text := current_setting('supabase.service_role_key', true);
BEGIN
  IF v_key IS NULL OR v_key = '' THEN
    v_key := current_setting('app.settings.service_role_key', true);
  END IF;
  RETURN QUERY SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_key),
    body := '{"dryRun": true}'::jsonb
  );
END $$;

REVOKE ALL ON FUNCTION public._smoke_test_detect_attendance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._smoke_test_detect_attendance() TO service_role;