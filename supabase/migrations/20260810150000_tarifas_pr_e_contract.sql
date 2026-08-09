-- =====================================================================
-- Tarifas por Serviço — PR-E (CONTRACT): o modelo vira lei.
--
-- 1) service_type_id vira NOT NULL em sessions e class_templates
--    (pré-checagem aborta se existir NULL — backfill+trigger garantiram).
-- 2) O trigger TRANSITÓRIO de preenchimento morre: todo caminho de
--    criação já grava o serviço explicitamente (PR-C). Inserir sem
--    serviço agora é ERRO do banco (23502), nunca adivinhação.
-- 3) A guarda de coerência (delivery_type ↔ session_type) vira regra
--    DEFINITIVA — trigger só-validação (CHECK não referencia outra
--    tabela). Template segue restrito a serviço de formato turma.
-- 4) Campos legados de tarifa do cadastro (hourly_rate_main_cents,
--    hourly_rate_assistant_cents, session_rate_cents, payment_method)
--    são MARCADOS como aposentados (COMMENT). O DROP físico fica pra
--    uma limpeza futura, após janela de estabilidade — nenhum código
--    do app os lê ou grava a partir desta PR.
--
-- Idempotente: o CI aplica duas vezes.
-- =====================================================================

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ---- 1) NOT NULL (com pré-checagem explícita) ----
DO $pre$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.sessions WHERE service_type_id IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'contract: % sessão(ões) sem serviço — investigar antes do NOT NULL', n;
  END IF;
  SELECT count(*) INTO n FROM public.class_templates WHERE service_type_id IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'contract: % template(s) sem serviço — investigar antes do NOT NULL', n;
  END IF;
END
$pre$;

ALTER TABLE public.sessions ALTER COLUMN service_type_id SET NOT NULL;
ALTER TABLE public.class_templates ALTER COLUMN service_type_id SET NOT NULL;

-- ---- 2+3) Preenchimento morre; coerência vira definitiva ----
DROP TRIGGER IF EXISTS sessions_fill_service_type ON public.sessions;
DROP TRIGGER IF EXISTS class_templates_fill_service_type ON public.class_templates;
DROP FUNCTION IF EXISTS public.fn_fill_service_type();

CREATE OR REPLACE FUNCTION public.fn_service_coherence_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- NULL não é caso da guarda: deixa o NOT NULL do banco falar (23502)
  -- com a mensagem certa, em vez de um 23514 enganoso de "incoerência".
  IF NEW.service_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'sessions' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.service_types st
       WHERE st.id = NEW.service_type_id
         AND st.delivery_type = NEW.session_type
    ) THEN
      RAISE EXCEPTION 'serviço incompatível com o formato da sessão (session_type=%)', NEW.session_type
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.service_types st
       WHERE st.id = NEW.service_type_id
         AND st.delivery_type = 'group'::public.session_type
    ) THEN
      RAISE EXCEPTION 'template só gera turma: o serviço precisa ter formato group'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_service_coherence_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sessions_service_coherence ON public.sessions;
CREATE TRIGGER sessions_service_coherence
  BEFORE INSERT OR UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_service_coherence_guard();

DROP TRIGGER IF EXISTS class_templates_service_coherence ON public.class_templates;
CREATE TRIGGER class_templates_service_coherence
  BEFORE INSERT OR UPDATE ON public.class_templates
  FOR EACH ROW EXECUTE FUNCTION public.fn_service_coherence_guard();

-- ---- 4) Aposentadoria dos campos legados (marca; DROP é limpeza futura) ----
COMMENT ON COLUMN public.trainers.hourly_rate_main_cents IS
  'APOSENTADO (PR-E tarifas, 10/08/2026): tarifa vive em trainer_service_rates. Nenhum código lê/grava. DROP em limpeza futura.';
COMMENT ON COLUMN public.trainers.hourly_rate_assistant_cents IS
  'APOSENTADO (PR-E tarifas, 10/08/2026): folha de assistente terá modelo próprio. Nenhum código lê/grava. DROP em limpeza futura.';
COMMENT ON COLUMN public.trainers.session_rate_cents IS
  'APOSENTADO (PR-E tarifas, 10/08/2026): base per_session vive em trainer_service_rates.rate_basis. DROP em limpeza futura.';
COMMENT ON COLUMN public.trainers.payment_method IS
  'APOSENTADO (PR-E tarifas, 10/08/2026): a base de cálculo é POR SERVIÇO (trainer_service_rates.rate_basis). DROP em limpeza futura.';

-- ---- Pós-condições ----
DO $check$
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='sessions'
         AND column_name='service_type_id') <> 'NO' THEN
    RAISE EXCEPTION 'pós: sessions.service_type_id ainda aceita NULL';
  END IF;
  IF (SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='class_templates'
         AND column_name='service_type_id') <> 'NO' THEN
    RAISE EXCEPTION 'pós: class_templates.service_type_id ainda aceita NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='fn_fill_service_type') THEN
    RAISE EXCEPTION 'pós: trigger transitório ainda existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='sessions_service_coherence') THEN
    RAISE EXCEPTION 'pós: guarda de coerência definitiva ausente em sessions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='class_templates_service_coherence') THEN
    RAISE EXCEPTION 'pós: guarda de coerência definitiva ausente em templates';
  END IF;
END
$check$;
