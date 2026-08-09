-- =====================================================================
-- Tarifas por Serviço — PR-D: a folha EXIBE o serviço e a base.
-- Recria a view payable_sessions com 3 colunas APENSADAS ao final
-- (service_type_id, payment_rate_basis, service_name via join no
-- catálogo), preservando security_invoker=on — a RLS das tabelas-base
-- continua valendo pra quem consulta (admin/instructor/reception).
--
-- Idempotente: CREATE OR REPLACE (o CI aplica duas vezes). O WHERE usa
-- status::text (semanticamente idêntico ao enum e portável pro fixture).
--
-- DONO NA PRÓPRIA VIEW (fecha dívida da revisão fria): admin vê a folha
-- inteira; instrutor vê SÓ as sessões em que é o treinador (ou
-- assistente) — antes, qualquer instructor/reception consultava a view
-- direto pela API e lia a remuneração de TODO MUNDO (sessions_select
-- permite; o .eq(trainer_id) da Minha Folha era só filtro client-side).
-- =====================================================================

CREATE OR REPLACE VIEW public.payable_sessions
WITH (security_invoker = on) AS
SELECT s.id,
    s.session_date,
    s.start_time,
    s.end_time,
    s.duration_minutes,
    s.session_type,
    s.modality,
    s.status,
    s.trainer_id,
    t.full_name AS trainer_name,
    s.assistant_trainer_id,
    at.full_name AS assistant_trainer_name,
    s.trainer_hourly_rate_cents,
    s.assistant_hourly_rate_cents,
    s.payment_hours,
    s.payment_amount_cents,
    s.assistant_payment_amount_cents,
    s.is_paid,
    s.paid_at,
    s.student_id,
    st.full_name AS student_name,
    s.contract_id,
    s.service_type_id,
    s.payment_rate_basis,
    svc.name AS service_name
   FROM public.sessions s
     LEFT JOIN public.trainers t ON t.id = s.trainer_id
     LEFT JOIN public.trainers at ON at.id = s.assistant_trainer_id
     LEFT JOIN public.students st ON st.id = s.student_id
     LEFT JOIN public.service_types svc ON svc.id = s.service_type_id
  WHERE s.status::text = ANY (ARRAY['completed', 'cancelled_late', 'no_show', 'late_arrival'])
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE p.auth_user_id = auth.uid()
           AND (p.id = t.profile_id OR p.id = at.profile_id)
      )
    );

-- Pós-condições: a view saiu como prometido.
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'payable_sessions'
       AND column_name = 'service_name'
  ) THEN
    RAISE EXCEPTION 'pós: payable_sessions sem service_name';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'payable_sessions'
       AND column_name = 'payment_rate_basis'
  ) THEN
    RAISE EXCEPTION 'pós: payable_sessions sem payment_rate_basis';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.payable_sessions'::regclass
       AND reloptions @> ARRAY['security_invoker=on']
  ) THEN
    RAISE EXCEPTION 'pós: payable_sessions perdeu security_invoker';
  END IF;
END
$check$;
