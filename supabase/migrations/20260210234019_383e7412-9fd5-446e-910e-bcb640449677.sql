
-- Fix security definer view
ALTER VIEW public.payable_sessions SET (security_invoker = on);
