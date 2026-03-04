-- Function to mark overdue invoices automatically
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.invoices
  SET status = 'overdue', updated_at = now()
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
END;
$$;

-- Create a trigger function that runs on any invoices insert/update to check overdue
-- This ensures overdue status is checked whenever invoices are accessed
CREATE OR REPLACE FUNCTION public.check_overdue_on_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Mark any pending invoices past due date as overdue
  UPDATE public.invoices
  SET status = 'overdue', updated_at = now()
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  RETURN NEW;
END;
$$;