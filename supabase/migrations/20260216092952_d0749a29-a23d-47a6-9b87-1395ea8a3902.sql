CREATE OR REPLACE FUNCTION public.auto_start_nurturing_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.sequence_executions (sequence_id, lead_id, current_step, status, next_step_at)
    SELECT s.id, NEW.id, 0, 'running', now()
    FROM public.nurturing_sequences s
    WHERE s.is_active = true
      AND s.trigger_status = NEW.status
      AND NOT EXISTS (
        SELECT 1 FROM public.sequence_executions se
        WHERE se.sequence_id = s.id
          AND se.lead_id = NEW.id
          AND se.status = 'running'
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_start_nurturing ON public.leads;
CREATE TRIGGER trg_auto_start_nurturing
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_start_nurturing_sequence();