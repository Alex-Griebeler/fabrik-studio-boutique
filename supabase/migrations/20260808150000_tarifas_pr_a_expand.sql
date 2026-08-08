-- =====================================================================
-- Tarifas por Serviço — PR-A (EXPAND).
-- Plano: PLANO_TARIFAS_POR_SERVICO_2026-08-07.md (Onda 2d-2).
--
-- Fase expand do expand/contract: TUDO aqui é aditivo e convive com o
-- bundle antigo no ar. NADA de NOT NULL em coluna nova; o aperto
-- (NOT NULL + remoção do trigger transitório) é a PR-E.
--
-- Idempotente de ponta a ponta: o CI aplica esta migration DUAS vezes.
-- =====================================================================

-- Tabelas são minúsculas (~20 sessões), mas ALTER TABLE toma ACCESS
-- EXCLUSIVE: falha rápido atrás de transação longa em vez de enfileirar.
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ---------------------------------------------------------------------
-- 1) Catálogo de serviços (o que PRECIFICA: grupo, personal, fisio...).
--    delivery_type reusa o enum session_type: serviço declara o FORMATO
--    da sessão que ele gera (grupo→group, fisioterapia→personal).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  delivery_type public.session_type NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_types_slug_unique UNIQUE (slug),
  CONSTRAINT service_types_slug_format CHECK (slug ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT service_types_name_not_blank CHECK (btrim(name) <> '')
);

-- Slug e delivery_type são identidade do serviço: imutáveis. Slug porque
-- código e integrações penduram nele; delivery_type porque sessões e
-- templates já classificados herdariam incoerência retroativa (e a guarda
-- de coerência passaria a bloquear cancelamento/edição dos existentes).
-- Mudou o formato? Serviço novo + is_active=false no antigo.
CREATE OR REPLACE FUNCTION public.fn_service_types_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'service_types.slug é imutável (%). Crie um serviço novo e desative o antigo.', OLD.slug
      USING ERRCODE = '0A000';
  END IF;
  IF NEW.delivery_type IS DISTINCT FROM OLD.delivery_type THEN
    RAISE EXCEPTION 'service_types.delivery_type é imutável (%). Crie um serviço novo e desative o antigo.', OLD.slug
      USING ERRCODE = '0A000';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_service_types_immutable_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_types_immutable_fields ON public.service_types;
CREATE TRIGGER service_types_immutable_fields
  BEFORE UPDATE ON public.service_types
  FOR EACH ROW EXECUTE FUNCTION public.fn_service_types_immutable_fields();

DROP TRIGGER IF EXISTS update_service_types_updated_at ON public.service_types;
CREATE TRIGGER update_service_types_updated_at
  BEFORE UPDATE ON public.service_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2) Tarifa por treinador × serviço, com base de cálculo POR SERVIÇO
--    (hourly | per_session). "Híbrido" = ter serviços com bases diferentes.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trainer_service_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL REFERENCES public.service_types(id) ON DELETE RESTRICT,
  rate_basis text NOT NULL,
  rate_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trainer_service_rates_pair_unique UNIQUE (trainer_id, service_type_id),
  CONSTRAINT trainer_service_rates_basis_check CHECK (rate_basis IN ('hourly', 'per_session')),
  CONSTRAINT trainer_service_rates_cents_positive CHECK (rate_cents > 0)
);

-- O UNIQUE (trainer_id, service_type_id) já indexa buscas por treinador;
-- este cobre o outro lado (joins/relatórios por serviço).
CREATE INDEX IF NOT EXISTS idx_trainer_service_rates_service
  ON public.trainer_service_rates (service_type_id);

DROP TRIGGER IF EXISTS update_trainer_service_rates_updated_at ON public.trainer_service_rates;
CREATE TRIGGER update_trainer_service_rates_updated_at
  BEFORE UPDATE ON public.trainer_service_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Remuneração é dado sensível e muda dinheiro da folha: auditada.
DROP TRIGGER IF EXISTS audit_trainer_service_rates ON public.trainer_service_rates;
CREATE TRIGGER audit_trainer_service_rates
  AFTER INSERT OR UPDATE OR DELETE ON public.trainer_service_rates
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

DROP TRIGGER IF EXISTS audit_service_types ON public.service_types;
CREATE TRIGGER audit_service_types
  AFTER INSERT OR UPDATE OR DELETE ON public.service_types
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- ---------------------------------------------------------------------
-- 3) RLS + privilégios (postura 1.5a: revogar o amplo, conceder o exato).
--    Catálogo: leitura para qualquer logado (nomes de serviço aparecem na
--    agenda de todo papel); escrita só admin; sem DELETE (aposenta com
--    is_active=false — histórico e FKs ficam íntegros).
--    Tarifas: leitura admin+instructor (quem gera agenda resolve tarifa no
--    client — dívida registrada no plano); escrita só admin.
-- ---------------------------------------------------------------------
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_service_rates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.service_types FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.service_types TO authenticated;
GRANT ALL ON public.service_types TO service_role;

REVOKE ALL ON public.trainer_service_rates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainer_service_rates TO authenticated;
GRANT ALL ON public.trainer_service_rates TO service_role;

DROP POLICY IF EXISTS service_types_select_authenticated ON public.service_types;
CREATE POLICY service_types_select_authenticated
  ON public.service_types FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS service_types_insert_admin ON public.service_types;
CREATE POLICY service_types_insert_admin
  ON public.service_types FOR INSERT TO authenticated
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS service_types_update_admin ON public.service_types;
CREATE POLICY service_types_update_admin
  ON public.service_types FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS trainer_service_rates_select_staff ON public.trainer_service_rates;
CREATE POLICY trainer_service_rates_select_staff
  ON public.trainer_service_rates FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'instructor'::public.app_role)
  );

DROP POLICY IF EXISTS trainer_service_rates_insert_admin ON public.trainer_service_rates;
CREATE POLICY trainer_service_rates_insert_admin
  ON public.trainer_service_rates FOR INSERT TO authenticated
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS trainer_service_rates_update_admin ON public.trainer_service_rates;
CREATE POLICY trainer_service_rates_update_admin
  ON public.trainer_service_rates FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS trainer_service_rates_delete_admin ON public.trainer_service_rates;
CREATE POLICY trainer_service_rates_delete_admin
  ON public.trainer_service_rates FOR DELETE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

-- ---------------------------------------------------------------------
-- 4) Seeds do catálogo (a tela de serviços nasce na PR-B; estes três são
--    a regra vigente ratificada pelo Alex em 07/08).
-- ---------------------------------------------------------------------
INSERT INTO public.service_types (slug, name, delivery_type, sort_order) VALUES
  ('grupo',        'Grupo',        'group'::public.session_type,    10),
  ('personal',     'Personal',     'personal'::public.session_type, 20),
  ('fisioterapia', 'Fisioterapia', 'personal'::public.session_type, 30)
ON CONFLICT (slug) DO NOTHING;

-- Tarifas do Alex (R$100/h flat em grupo e personal, confirmado pelo dono).
-- Condicional à existência do trainer: em produção insere 2 linhas; num
-- banco de CI sem o cadastro, insere 0 e segue. SEM 75/45 automático para
-- os demais — decisão do plano: só o Alex conhece as exceções, preenchimento
-- vem pela tela (PR-B) com ação em lote revisada.
INSERT INTO public.trainer_service_rates (trainer_id, service_type_id, rate_basis, rate_cents)
SELECT t.id, st.id, 'hourly', 10000
FROM public.trainers t
JOIN public.service_types st ON st.slug IN ('grupo', 'personal')
WHERE t.id = '4fd214e3-214c-433d-bde2-5e91957dc95a'
ON CONFLICT (trainer_id, service_type_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5) Classificação canônica nas entidades existentes (nullable de
--    propósito — bundle antigo continua inserindo sem a coluna).
--    payment_rate_basis: snapshot da base usada no cálculo (PR-C passa a
--    gravar; linhas antigas ficam NULL = hourly implícito da era anterior).
-- ---------------------------------------------------------------------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS service_type_id uuid REFERENCES public.service_types(id),
  ADD COLUMN IF NOT EXISTS payment_rate_basis text
    CONSTRAINT sessions_payment_rate_basis_check CHECK (payment_rate_basis IN ('hourly', 'per_session'));

ALTER TABLE public.class_templates
  ADD COLUMN IF NOT EXISTS service_type_id uuid REFERENCES public.service_types(id);

CREATE INDEX IF NOT EXISTS idx_sessions_service_type
  ON public.sessions (service_type_id);
CREATE INDEX IF NOT EXISTS idx_class_templates_service_type
  ON public.class_templates (service_type_id);

-- ---------------------------------------------------------------------
-- 6) Backfill dos existentes: session_type é o formato legado e mapeia
--    1:1 nos serviços seed (group→grupo, personal→personal). Templates
--    hoje só geram turma (o gerador grava session_type='group') → grupo.
-- ---------------------------------------------------------------------
UPDATE public.sessions s
   SET service_type_id = st.id
  FROM public.service_types st
 WHERE s.service_type_id IS NULL
   AND st.slug = CASE WHEN s.session_type = 'personal'::public.session_type
                      THEN 'personal' ELSE 'grupo' END;

UPDATE public.class_templates ct
   SET service_type_id = (SELECT id FROM public.service_types WHERE slug = 'grupo')
 WHERE ct.service_type_id IS NULL;

-- ---------------------------------------------------------------------
-- 7) TRIGGER TRANSITÓRIO DE COMPATIBILIDADE + GUARDA DE COERÊNCIA.
--    (a) Preenche service_type_id quando o bundle antigo insere sem
--        (ou quando um UPDATE anula) — mesmo mapeamento do backfill.
--    (b) Em INSERT E UPDATE, garante a invariante do modelo: o formato
--        do serviço (delivery_type) TEM que bater com session_type —
--        senão um staff gravaria sessão de turma precificada como
--        fisioterapia direto pela API. Template nesta fase só gera
--        turma, então o serviço dele precisa ser de formato group
--        (PR-C revisita quando template ganhar escolha de serviço).
--    O preenchimento (a) morre na PR-E; a guarda (b) vira constraint
--    definitiva lá.
--    SECURITY INVOKER de propósito: quem insere é authenticated, que lê
--    o catálogo pela policy de SELECT (true).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_fill_service_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.service_type_id IS NULL THEN
    IF TG_TABLE_NAME = 'sessions' THEN
      SELECT id INTO NEW.service_type_id
        FROM public.service_types
       WHERE slug = CASE WHEN NEW.session_type = 'personal'::public.session_type
                         THEN 'personal' ELSE 'grupo' END;
    ELSE
      SELECT id INTO NEW.service_type_id
        FROM public.service_types
       WHERE slug = 'grupo';
    END IF;
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
      RAISE EXCEPTION 'template só gera turma nesta fase: o serviço precisa ter formato group'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_fill_service_type() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sessions_fill_service_type ON public.sessions;
CREATE TRIGGER sessions_fill_service_type
  BEFORE INSERT OR UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_fill_service_type();

DROP TRIGGER IF EXISTS class_templates_fill_service_type ON public.class_templates;
CREATE TRIGGER class_templates_fill_service_type
  BEFORE INSERT OR UPDATE ON public.class_templates
  FOR EACH ROW EXECUTE FUNCTION public.fn_fill_service_type();

-- ---------------------------------------------------------------------
-- 8) Pós-condições: abortam a transação se o expand não deixou o banco
--    no estado prometido.
-- ---------------------------------------------------------------------
DO $check$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.service_types
   WHERE slug IN ('grupo', 'personal', 'fisioterapia');
  IF n <> 3 THEN
    RAISE EXCEPTION 'pós: seeds do catálogo incompletos (%/3)', n;
  END IF;

  SELECT count(*) INTO n FROM public.sessions WHERE service_type_id IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'pós: % sessão(ões) sem serviço após backfill', n;
  END IF;

  SELECT count(*) INTO n FROM public.class_templates WHERE service_type_id IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'pós: % template(s) sem serviço após backfill', n;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.trainer_service_rates'::regclass) THEN
    RAISE EXCEPTION 'pós: RLS desligada em trainer_service_rates';
  END IF;

  IF has_table_privilege('anon', 'public.trainer_service_rates', 'SELECT') THEN
    RAISE EXCEPTION 'pós: anon lê trainer_service_rates';
  END IF;

  -- Coerência global (pega deriva feita por fora do trigger, ex.: service_role):
  SELECT count(*) INTO n
    FROM public.sessions s
    JOIN public.service_types st ON st.id = s.service_type_id
   WHERE st.delivery_type <> s.session_type;
  IF n <> 0 THEN
    RAISE EXCEPTION 'pós: % sessão(ões) com serviço incoerente com o formato', n;
  END IF;

  SELECT count(*) INTO n
    FROM public.class_templates ct
    JOIN public.service_types st ON st.id = ct.service_type_id
   WHERE st.delivery_type <> 'group'::public.session_type;
  IF n <> 0 THEN
    RAISE EXCEPTION 'pós: % template(s) com serviço de formato não-group', n;
  END IF;
END
$check$;
