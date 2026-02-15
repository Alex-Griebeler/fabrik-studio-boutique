-- Allow anonymous anamnese form submission: update only qualification_details, name, phone, email
CREATE OR REPLACE FUNCTION public.update_lead_anamnese(
  p_lead_id uuid,
  p_qualification_details jsonb,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE leads
  SET
    qualification_details = p_qualification_details,
    name = COALESCE(p_name, name),
    phone = COALESCE(p_phone, phone),
    email = COALESCE(p_email, email),
    updated_at = now()
  WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
END;
$$;