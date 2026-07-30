-- P0-1: contain privileged SECURITY DEFINER RPCs and replace the public
-- lead-id-only anamnese flow with expiring, single-use links.

DO $$
DECLARE
  v_pgcrypto_schema text;
BEGIN
  SELECT n.nspname
  INTO v_pgcrypto_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF v_pgcrypto_schema IS DISTINCT FROM 'extensions' THEN
    RAISE EXCEPTION
      'P0-1 preflight failed: pgcrypto must be installed in schema extensions (found: %)',
      COALESCE(v_pgcrypto_schema, 'not installed')
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.to_regclass('public.anamnese_link_tokens') IS NOT NULL THEN
    RAISE EXCEPTION
      'P0-1 preflight failed: public.anamnese_link_tokens already exists; reconcile partial/manual deployment first'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE TABLE public.anamnese_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  last_failed_at timestamptz
);

CREATE INDEX anamnese_link_tokens_lead_created_idx
  ON public.anamnese_link_tokens (lead_id, created_at DESC);

CREATE UNIQUE INDEX anamnese_link_tokens_one_active_per_lead_idx
  ON public.anamnese_link_tokens (lead_id)
  WHERE used_at IS NULL;

ALTER TABLE public.anamnese_link_tokens ENABLE ROW LEVEL SECURITY;

-- This table is intentionally inaccessible through the Data API. Only the
-- narrowly scoped SECURITY DEFINER functions below can read or mutate it.
REVOKE ALL ON TABLE public.anamnese_link_tokens FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_anamnese_link(
  p_lead_id uuid,
  p_ttl interval DEFAULT interval '7 days'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NOT (
       public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
       OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
       OR public.has_role((SELECT auth.uid()), 'reception'::public.app_role)
     )
  THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_ttl < interval '15 minutes' OR p_ttl > interval '30 days' THEN
    RAISE EXCEPTION 'Invalid link lifetime' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id) THEN
    RAISE EXCEPTION 'Lead not found' USING ERRCODE = 'P0002';
  END IF;

  -- Invalidate older links before creating a replacement.
  UPDATE public.anamnese_link_tokens
  SET used_at = now()
  WHERE lead_id = p_lead_id
    AND used_at IS NULL;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.anamnese_link_tokens (
    lead_id,
    token_hash,
    expires_at,
    created_by
  )
  VALUES (
    p_lead_id,
    extensions.digest(v_token, 'sha256'),
    now() + p_ttl,
    (SELECT auth.uid())
  );

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_anamnese_link(uuid, interval)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_anamnese_link(uuid, interval)
  TO authenticated;

-- Drop the vulnerable overload before creating the token-bound replacement.
DROP FUNCTION IF EXISTS public.update_lead_anamnese(uuid, jsonb, text, text, text);

CREATE FUNCTION public.update_lead_anamnese(
  p_lead_id uuid,
  p_token text,
  p_qualification_details jsonb,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link public.anamnese_link_tokens%ROWTYPE;
  v_sanitized_details jsonb;
BEGIN
  IF p_token IS NULL
     OR length(p_token) <> 64
     OR p_token !~ '^[0-9a-f]{64}$'
  THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_expired');
  END IF;

  SELECT *
  INTO v_link
  FROM public.anamnese_link_tokens
  WHERE lead_id = p_lead_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND
     OR v_link.used_at IS NOT NULL
     OR v_link.expires_at <= now()
  THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_expired');
  END IF;

  IF v_link.failed_attempts >= 5
     AND v_link.last_failed_at > now() - interval '15 minutes'
  THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited');
  END IF;

  IF v_link.last_failed_at IS NULL
     OR v_link.last_failed_at <= now() - interval '15 minutes'
  THEN
    UPDATE public.anamnese_link_tokens
    SET failed_attempts = 0,
        last_failed_at = NULL
    WHERE id = v_link.id;
    v_link.failed_attempts := 0;
  END IF;

  IF extensions.digest(p_token, 'sha256') <> v_link.token_hash THEN
    UPDATE public.anamnese_link_tokens
    SET failed_attempts = failed_attempts + 1,
        last_failed_at = now()
    WHERE id = v_link.id;

    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_expired');
  END IF;

  IF jsonb_typeof(p_qualification_details) <> 'object'
     OR pg_column_size(p_qualification_details) > 32768
     OR jsonb_typeof(COALESCE(p_qualification_details->'dados_pessoais', '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_qualification_details->'perfil', '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_qualification_details->'treino', '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_qualification_details->'parq', '{}'::jsonb)) <> 'object'
  THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END IF;

  v_sanitized_details := jsonb_build_object(
    'anamnese_preenchida', true,
    'anamnese_data', now(),
    'dados_pessoais', jsonb_strip_nulls(jsonb_build_object(
      'nome', p_qualification_details->'dados_pessoais'->'nome',
      'telefone', p_qualification_details->'dados_pessoais'->'telefone',
      'email', p_qualification_details->'dados_pessoais'->'email',
      'idade', p_qualification_details->'dados_pessoais'->'idade',
      'profissao', p_qualification_details->'dados_pessoais'->'profissao'
    )),
    'perfil', jsonb_strip_nulls(jsonb_build_object(
      'como_conheceu', p_qualification_details->'perfil'->'como_conheceu',
      'indicacao_nome', p_qualification_details->'perfil'->'indicacao_nome',
      'busca_profissional', p_qualification_details->'perfil'->'busca_profissional',
      'onde_treina', p_qualification_details->'perfil'->'onde_treina',
      'nota_condicao_fisica', p_qualification_details->'perfil'->'nota_condicao_fisica',
      'nota_satisfacao_corpo', p_qualification_details->'perfil'->'nota_satisfacao_corpo'
    )),
    'treino', jsonb_strip_nulls(jsonb_build_object(
      'objetivos', p_qualification_details->'treino'->'objetivos',
      'areas_melhorar', p_qualification_details->'treino'->'areas_melhorar',
      'periodo_treino', p_qualification_details->'treino'->'periodo_treino',
      'frequencia_semanal', p_qualification_details->'treino'->'frequencia_semanal',
      'maior_dificuldade', p_qualification_details->'treino'->'maior_dificuldade',
      'expectativa_experimental', p_qualification_details->'treino'->'expectativa_experimental'
    )),
    'parq', jsonb_strip_nulls(jsonb_build_object(
      'problema_cardiaco', p_qualification_details->'parq'->'problema_cardiaco',
      'dor_peito_exercicio', p_qualification_details->'parq'->'dor_peito_exercicio',
      'dor_peito_ultimo_mes', p_qualification_details->'parq'->'dor_peito_ultimo_mes',
      'perda_consciencia', p_qualification_details->'parq'->'perda_consciencia',
      'problema_osseo', p_qualification_details->'parq'->'problema_osseo',
      'medicamento_pressao', p_qualification_details->'parq'->'medicamento_pressao',
      'impedimento_medico', p_qualification_details->'parq'->'impedimento_medico'
    )),
    'termo_aceito', true,
    'termo_aceito_em', now()
  );

  UPDATE public.leads
  SET qualification_details = v_sanitized_details,
      name = COALESCE(NULLIF(btrim(p_name), ''), name),
      phone = COALESCE(NULLIF(btrim(p_phone), ''), phone),
      email = COALESCE(NULLIF(btrim(p_email), ''), email),
      updated_at = now()
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_expired');
  END IF;

  UPDATE public.anamnese_link_tokens
  SET used_at = now(),
      failed_attempts = 0,
      last_failed_at = NULL
  WHERE id = v_link.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_lead_anamnese(
  uuid, text, jsonb, text, text, text
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.update_lead_anamnese(
  uuid, text, jsonb, text, text, text
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
    OR COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role'
  )
  THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.invoices
  SET status = 'overdue',
      updated_at = now()
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_overdue_invoices()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_overdue_invoices()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.calculate_monthly_kpis(p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month_start date;
  v_month_end date;
  v_total_leads int;
  v_leads_marketing int;
  v_leads_indicacao int;
  v_total_experimentais int;
  v_total_conversoes int;
  v_conversoes_indicacao int;
  v_conversoes_marketing int;
  v_cancelamentos int;
  v_faturamento int;
  v_despesas int;
  v_total_alunos int;
  v_alunos_novos int;
  v_alunos_perdidos int;
  v_prev_alunos int;
BEGIN
  IF NOT (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
    OR COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role'
  )
  THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  v_month_start := date_trunc('month', p_date)::date;
  v_month_end := (date_trunc('month', p_date) + interval '1 month' - interval '1 day')::date;

  SELECT count(*) INTO v_total_leads
  FROM public.leads
  WHERE created_at::date BETWEEN v_month_start AND v_month_end;

  SELECT count(*) INTO v_leads_marketing
  FROM public.leads
  WHERE created_at::date BETWEEN v_month_start AND v_month_end
    AND source IN ('instagram', 'google', 'tiktok', 'facebook', 'site');

  SELECT count(*) INTO v_leads_indicacao
  FROM public.leads
  WHERE created_at::date BETWEEN v_month_start AND v_month_end
    AND source = 'indicacao';

  SELECT count(*) INTO v_total_experimentais
  FROM public.leads
  WHERE trial_date BETWEEN v_month_start AND v_month_end;

  SELECT count(*) INTO v_total_conversoes
  FROM public.leads
  WHERE status = 'converted'
    AND updated_at::date BETWEEN v_month_start AND v_month_end;

  SELECT count(*) INTO v_conversoes_indicacao
  FROM public.leads
  WHERE status = 'converted'
    AND updated_at::date BETWEEN v_month_start AND v_month_end
    AND source = 'indicacao';

  SELECT count(*) INTO v_conversoes_marketing
  FROM public.leads
  WHERE status = 'converted'
    AND updated_at::date BETWEEN v_month_start AND v_month_end
    AND source IN ('instagram', 'google', 'tiktok', 'facebook', 'site');

  SELECT count(*) INTO v_cancelamentos
  FROM public.contracts
  WHERE status = 'cancelled'
    AND cancelled_at::date BETWEEN v_month_start AND v_month_end;

  SELECT COALESCE(sum(paid_amount_cents), 0) INTO v_faturamento
  FROM public.invoices
  WHERE status = 'paid'
    AND payment_date BETWEEN v_month_start AND v_month_end;

  SELECT COALESCE(sum(amount_cents), 0) INTO v_despesas
  FROM public.expenses
  WHERE status = 'paid'
    AND payment_date BETWEEN v_month_start AND v_month_end;

  SELECT count(*) INTO v_total_alunos
  FROM public.students
  WHERE status = 'active';

  SELECT count(*) INTO v_alunos_novos
  FROM public.students
  WHERE created_at::date BETWEEN v_month_start AND v_month_end
    AND status = 'active';

  SELECT count(*) INTO v_alunos_perdidos
  FROM public.students
  WHERE status = 'inactive'
    AND updated_at::date BETWEEN v_month_start AND v_month_end;

  SELECT count(*) INTO v_prev_alunos
  FROM public.students s
  JOIN public.contracts c ON c.student_id = s.id
  WHERE c.status = 'active'
    AND c.start_date < v_month_start;

  INSERT INTO public.monthly_kpis (
    competencia, total_leads, leads_marketing, leads_indicacao, leads_resgate,
    total_experimentais, total_conversoes, conversoes_indicacao, conversoes_marketing,
    taxa_conversao_leads, taxa_conversao_experimentais,
    planos_para_renovar, renovacoes_efetivas, taxa_renovacao,
    cancelamentos, taxa_churn,
    faturamento_cents, despesas_cents, resultado_cents, margem_lucro_pct,
    total_alunos, alunos_novos, alunos_perdidos, calculado_em
  )
  VALUES (
    v_month_start,
    v_total_leads, v_leads_marketing, v_leads_indicacao, 0,
    v_total_experimentais, v_total_conversoes, v_conversoes_indicacao, v_conversoes_marketing,
    CASE WHEN v_total_leads > 0
      THEN round(v_total_conversoes::numeric / v_total_leads * 100, 1)
      ELSE 0 END,
    CASE WHEN v_total_experimentais > 0
      THEN round(v_total_conversoes::numeric / v_total_experimentais * 100, 1)
      ELSE 0 END,
    0, 0, 0,
    v_cancelamentos,
    CASE WHEN v_prev_alunos > 0
      THEN round(v_cancelamentos::numeric / v_prev_alunos * 100, 1)
      ELSE 0 END,
    v_faturamento, v_despesas, v_faturamento - v_despesas,
    CASE WHEN v_faturamento > 0
      THEN round((v_faturamento - v_despesas)::numeric / v_faturamento * 100, 1)
      ELSE 0 END,
    v_total_alunos, v_alunos_novos, v_alunos_perdidos, now()
  )
  ON CONFLICT (competencia) DO UPDATE SET
    total_leads = EXCLUDED.total_leads,
    leads_marketing = EXCLUDED.leads_marketing,
    leads_indicacao = EXCLUDED.leads_indicacao,
    total_experimentais = EXCLUDED.total_experimentais,
    total_conversoes = EXCLUDED.total_conversoes,
    conversoes_indicacao = EXCLUDED.conversoes_indicacao,
    conversoes_marketing = EXCLUDED.conversoes_marketing,
    taxa_conversao_leads = EXCLUDED.taxa_conversao_leads,
    taxa_conversao_experimentais = EXCLUDED.taxa_conversao_experimentais,
    cancelamentos = EXCLUDED.cancelamentos,
    taxa_churn = EXCLUDED.taxa_churn,
    faturamento_cents = EXCLUDED.faturamento_cents,
    despesas_cents = EXCLUDED.despesas_cents,
    resultado_cents = EXCLUDED.resultado_cents,
    margem_lucro_pct = EXCLUDED.margem_lucro_pct,
    total_alunos = EXCLUDED.total_alunos,
    alunos_novos = EXCLUDED.alunos_novos,
    alunos_perdidos = EXCLUDED.alunos_perdidos,
    calculado_em = now();
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_monthly_kpis(date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_monthly_kpis(date)
  TO authenticated, service_role;
