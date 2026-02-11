
-- =============================================
-- FASE 1: Consultores & Comissões
-- =============================================

-- Enum for commission types
CREATE TYPE public.commission_type AS ENUM ('venda_nova', 'renovacao', 'indicacao', 'meta');

-- Enum for commission status
CREATE TYPE public.commission_status AS ENUM ('calculada', 'aprovada', 'paga', 'cancelada');

-- Enum for task types
CREATE TYPE public.task_type AS ENUM ('ligar', 'whatsapp', 'email', 'seguir_experimental', 'fechar_venda', 'outro');

-- Enum for task priority
CREATE TYPE public.task_priority AS ENUM ('baixa', 'media', 'alta', 'urgente');

-- Enum for task status
CREATE TYPE public.task_status AS ENUM ('pendente', 'em_andamento', 'concluida', 'cancelada');

-- Add fields to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS temperature text,
  ADD COLUMN IF NOT EXISTS consultant_id uuid REFERENCES public.profiles(id);

-- Add commission rate to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS commission_rate_pct numeric DEFAULT 10;

-- Commissions table
CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  competencia date NOT NULL,
  tipo public.commission_type NOT NULL,
  contract_id uuid REFERENCES public.contracts(id),
  lead_id uuid REFERENCES public.leads(id),
  valor_base_cents integer NOT NULL DEFAULT 0,
  percentual_comissao numeric NOT NULL DEFAULT 0,
  valor_comissao_cents integer NOT NULL DEFAULT 0,
  status public.commission_status NOT NULL DEFAULT 'calculada',
  data_pagamento date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commissions_select" ON public.commissions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "commissions_insert" ON public.commissions FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "commissions_update" ON public.commissions FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "commissions_delete" ON public.commissions FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_commissions_updated_at
  BEFORE UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sales targets table
CREATE TABLE public.sales_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  competencia date NOT NULL,
  meta_leads integer NOT NULL DEFAULT 0,
  meta_experimentais integer NOT NULL DEFAULT 0,
  meta_conversoes integer NOT NULL DEFAULT 0,
  meta_faturamento_cents integer NOT NULL DEFAULT 0,
  realizado_leads integer NOT NULL DEFAULT 0,
  realizado_experimentais integer NOT NULL DEFAULT 0,
  realizado_conversoes integer NOT NULL DEFAULT 0,
  realizado_faturamento_cents integer NOT NULL DEFAULT 0,
  bonus_cents integer NOT NULL DEFAULT 0,
  meta_batida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, competencia)
);

ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_targets_select" ON public.sales_targets FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "sales_targets_insert" ON public.sales_targets FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sales_targets_update" ON public.sales_targets FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sales_targets_delete" ON public.sales_targets FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_sales_targets_updated_at
  BEFORE UPDATE ON public.sales_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- FASE 2: Tarefas & Follow-up
-- =============================================

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.task_type NOT NULL DEFAULT 'outro',
  lead_id uuid REFERENCES public.leads(id),
  student_id uuid REFERENCES public.students(id),
  assignee_id uuid NOT NULL REFERENCES public.profiles(id),
  titulo text NOT NULL,
  descricao text,
  data_prevista timestamptz,
  prioridade public.task_priority NOT NULL DEFAULT 'media',
  status public.task_status NOT NULL DEFAULT 'pendente',
  data_conclusao timestamptz,
  resultado text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select" ON public.tasks FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR assignee_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR assignee_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR assignee_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create task on new lead
CREATE OR REPLACE FUNCTION public.auto_create_lead_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.consultant_id IS NOT NULL THEN
    INSERT INTO public.tasks (tipo, lead_id, assignee_id, titulo, descricao, data_prevista, prioridade)
    VALUES (
      'ligar',
      NEW.id,
      NEW.consultant_id,
      'Primeiro contato: ' || NEW.name,
      'Fazer primeiro contato com o lead ' || NEW.name,
      now() + interval '1 day',
      'alta'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_lead_task
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_lead_task();

-- =============================================
-- FASE 3: KPIs Mensais
-- =============================================

CREATE TABLE public.monthly_kpis (
  competencia date PRIMARY KEY,
  total_leads integer NOT NULL DEFAULT 0,
  leads_marketing integer NOT NULL DEFAULT 0,
  leads_indicacao integer NOT NULL DEFAULT 0,
  leads_resgate integer NOT NULL DEFAULT 0,
  total_experimentais integer NOT NULL DEFAULT 0,
  total_conversoes integer NOT NULL DEFAULT 0,
  conversoes_indicacao integer NOT NULL DEFAULT 0,
  conversoes_marketing integer NOT NULL DEFAULT 0,
  taxa_conversao_leads numeric NOT NULL DEFAULT 0,
  taxa_conversao_experimentais numeric NOT NULL DEFAULT 0,
  planos_para_renovar integer NOT NULL DEFAULT 0,
  renovacoes_efetivas integer NOT NULL DEFAULT 0,
  taxa_renovacao numeric NOT NULL DEFAULT 0,
  cancelamentos integer NOT NULL DEFAULT 0,
  taxa_churn numeric NOT NULL DEFAULT 0,
  faturamento_cents integer NOT NULL DEFAULT 0,
  despesas_cents integer NOT NULL DEFAULT 0,
  resultado_cents integer NOT NULL DEFAULT 0,
  margem_lucro_pct numeric NOT NULL DEFAULT 0,
  total_alunos integer NOT NULL DEFAULT 0,
  alunos_novos integer NOT NULL DEFAULT 0,
  alunos_perdidos integer NOT NULL DEFAULT 0,
  calculado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.monthly_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_kpis_select" ON public.monthly_kpis FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "monthly_kpis_insert" ON public.monthly_kpis FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "monthly_kpis_update" ON public.monthly_kpis FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "monthly_kpis_delete" ON public.monthly_kpis FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to calculate monthly KPIs
CREATE OR REPLACE FUNCTION public.calculate_monthly_kpis(p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_month_start := date_trunc('month', p_date)::date;
  v_month_end := (date_trunc('month', p_date) + interval '1 month' - interval '1 day')::date;

  -- Leads
  SELECT count(*) INTO v_total_leads FROM leads WHERE created_at::date BETWEEN v_month_start AND v_month_end;
  SELECT count(*) INTO v_leads_marketing FROM leads WHERE created_at::date BETWEEN v_month_start AND v_month_end AND source IN ('instagram','google','tiktok','facebook','site');
  SELECT count(*) INTO v_leads_indicacao FROM leads WHERE created_at::date BETWEEN v_month_start AND v_month_end AND source = 'indicacao';

  -- Experimentais
  SELECT count(*) INTO v_total_experimentais FROM leads WHERE trial_date BETWEEN v_month_start AND v_month_end;

  -- Conversões
  SELECT count(*) INTO v_total_conversoes FROM leads WHERE status = 'converted' AND updated_at::date BETWEEN v_month_start AND v_month_end;
  SELECT count(*) INTO v_conversoes_indicacao FROM leads WHERE status = 'converted' AND updated_at::date BETWEEN v_month_start AND v_month_end AND source = 'indicacao';
  SELECT count(*) INTO v_conversoes_marketing FROM leads WHERE status = 'converted' AND updated_at::date BETWEEN v_month_start AND v_month_end AND source IN ('instagram','google','tiktok','facebook','site');

  -- Cancelamentos
  SELECT count(*) INTO v_cancelamentos FROM contracts WHERE status = 'cancelled' AND cancelled_at::date BETWEEN v_month_start AND v_month_end;

  -- Faturamento
  SELECT COALESCE(sum(paid_amount_cents), 0) INTO v_faturamento FROM invoices WHERE status = 'paid' AND payment_date BETWEEN v_month_start AND v_month_end;

  -- Despesas
  SELECT COALESCE(sum(amount_cents), 0) INTO v_despesas FROM expenses WHERE status = 'paid' AND payment_date BETWEEN v_month_start AND v_month_end;

  -- Alunos
  SELECT count(*) INTO v_total_alunos FROM students WHERE status = 'active';
  SELECT count(*) INTO v_alunos_novos FROM students WHERE created_at::date BETWEEN v_month_start AND v_month_end AND status = 'active';
  SELECT count(*) INTO v_alunos_perdidos FROM students WHERE status = 'inactive' AND updated_at::date BETWEEN v_month_start AND v_month_end;

  -- Previous month active students for churn
  SELECT count(*) INTO v_prev_alunos FROM students s
    JOIN contracts c ON c.student_id = s.id
    WHERE c.status = 'active' AND c.start_date < v_month_start;

  INSERT INTO monthly_kpis (
    competencia, total_leads, leads_marketing, leads_indicacao, leads_resgate,
    total_experimentais, total_conversoes, conversoes_indicacao, conversoes_marketing,
    taxa_conversao_leads, taxa_conversao_experimentais,
    planos_para_renovar, renovacoes_efetivas, taxa_renovacao,
    cancelamentos, taxa_churn,
    faturamento_cents, despesas_cents, resultado_cents, margem_lucro_pct,
    total_alunos, alunos_novos, alunos_perdidos, calculado_em
  ) VALUES (
    v_month_start,
    v_total_leads, v_leads_marketing, v_leads_indicacao, 0,
    v_total_experimentais, v_total_conversoes, v_conversoes_indicacao, v_conversoes_marketing,
    CASE WHEN v_total_leads > 0 THEN round(v_total_conversoes::numeric / v_total_leads * 100, 1) ELSE 0 END,
    CASE WHEN v_total_experimentais > 0 THEN round(v_total_conversoes::numeric / v_total_experimentais * 100, 1) ELSE 0 END,
    0, 0, 0,
    v_cancelamentos,
    CASE WHEN v_prev_alunos > 0 THEN round(v_cancelamentos::numeric / v_prev_alunos * 100, 1) ELSE 0 END,
    v_faturamento, v_despesas, v_faturamento - v_despesas,
    CASE WHEN v_faturamento > 0 THEN round((v_faturamento - v_despesas)::numeric / v_faturamento * 100, 1) ELSE 0 END,
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
