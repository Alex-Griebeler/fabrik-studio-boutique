-- ============================================================================
-- T1 — Colaboradores: hardening de user_roles + saga de operações de equipe
-- Spec: ~/Documents/APP Fabrik Gestão/PLANO_COLABORADORES_SIDEBAR_2026-08-10.md (v5,
-- aprovada por 4 rodadas quentes + 2 frias do Codex)
--
-- O que esta migration entrega, na ordem:
--   1. Schema `private` (auxiliares fora da Data API) + lock central de papéis.
--   2. user_roles vira escrita-por-serviço: REVOKE de DML direto de authenticated
--      (a RLS de escrita atual deixava QUALQUER admin logado escrever direto pela
--      API — as guardas de RPC seriam decorativas sem isto).
--   3. Guarda no banco: linha de user_roles é IMUTÁVEL (associação muda por
--      INSERT/DELETE, nunca UPDATE) e o ÚLTIMO admin não pode ser removido —
--      serializado por advisory lock transacional (vale até para service_role e
--      para o cascade de auth.admin.deleteUser).
--   4. Auditoria física de user_roles (fn_audit_log, como as tabelas financeiras).
--   5. team_operations: registro de domínio + idempotência da saga (operation_id,
--      fingerprint, lease com fencing token, phase por ação, terminais imutáveis).
--   6. RPCs transacionais SECURITY DEFINER com owner de capacidade team_ops.
--      O ATOR NUNCA é parâmetro: deriva de auth.uid() — a Edge chama as RPCs
--      com o JWT DO USUÁRIO (EXECUTE é de authenticated; service_role não
--      executa nem escreve nada: um bearer comprometido não escala nem
--      falsifica autoria). Nenhuma função SQL consulta auth.users.
--   7. Pós-condições executáveis (privilégios, RLS, triggers) — a migration
--      ABORTA se qualquer promessa não se materializar.
--
-- Idempotente: a CI aplica duas vezes (timestamps distintos); a segunda passada
-- não altera estado nem falha.
-- ============================================================================

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Schema private + lock central
-- ────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- Chave fixa de 2 inteiros (não hashtext: espaço de 32 bits colide e some da
-- vista). 20260810 = data da spec; 1 = domínio "user_roles". Ordem global de
-- locks do domínio de equipe: team lock PRIMEIRO, linhas depois.
CREATE OR REPLACE FUNCTION private.team_lock_user_roles()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT pg_advisory_xact_lock(20260810, 1); $$;

-- Role de CAPACIDADE (fria T1, achado 3): as RPCs viram SECURITY DEFINER com
-- owner team_ops — e o service_role PERDE o DML direto em user_roles e
-- team_operations. Um bearer de service_role comprometido (o incidente A3.1
-- foi exatamente isso) não escreve papéis por fora da saga nunca mais.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'team_ops') THEN
    CREATE ROLE team_ops NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB
      NOCREATEROLE NOREPLICATION;
  END IF;
  -- ALTER ... OWNER TO team_ops exige que o executor seja MEMBRO da role e
  -- que ela tenha CREATE no schema — vale para o postgres NÃO-superuser do
  -- ambiente hospedado (a CI local com superuser mascararia isso).
  EXECUTE format('GRANT team_ops TO %I', current_user);
END $role$;
GRANT USAGE ON SCHEMA private TO team_ops;
GRANT USAGE ON SCHEMA public TO team_ops;
GRANT CREATE ON SCHEMA private TO team_ops;
GRANT CREATE ON SCHEMA public TO team_ops;

REVOKE ALL ON FUNCTION private.team_lock_user_roles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.team_lock_user_roles() TO service_role, team_ops;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. user_roles: fim da escrita direta
-- ────────────────────────────────────────────────────────────────────────────

REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM PUBLIC, anon, authenticated;
-- TRUNCATE ignora RLS e triggers de LINHA: com o GRANT ALL default da nuvem,
-- qualquer authenticated poderia zerar user_roles inteira (fria T1, CRÍTICO).
-- Morre para TODO MUNDO — inclusive service_role.
REVOKE TRUNCATE ON public.user_roles FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM service_role;
DROP POLICY IF EXISTS "user_roles_insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_delete" ON public.user_roles;
-- ("user_roles_select" — admin OU dono — permanece.)

-- team_ops escreve (as RPCs DEFINER rodam como ela); policies próprias porque
-- RLS segue ligada e team_ops não tem BYPASSRLS.
GRANT SELECT, INSERT, DELETE ON public.user_roles TO team_ops;
DROP POLICY IF EXISTS "user_roles_teamops_select" ON public.user_roles;
CREATE POLICY "user_roles_teamops_select" ON public.user_roles
  FOR SELECT TO team_ops USING (true);
DROP POLICY IF EXISTS "user_roles_teamops_insert" ON public.user_roles;
CREATE POLICY "user_roles_teamops_insert" ON public.user_roles
  FOR INSERT TO team_ops WITH CHECK (true);
DROP POLICY IF EXISTS "user_roles_teamops_delete" ON public.user_roles;
CREATE POLICY "user_roles_teamops_delete" ON public.user_roles
  FOR DELETE TO team_ops USING (true);

-- Cinto e suspensório: TRUNCATE bloqueado por trigger de STATEMENT (pega até
-- owner/superuser, que ignoram privilégios mas não triggers).
CREATE OR REPLACE FUNCTION public.fn_user_roles_no_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE em user_roles é proibido';
END;
$$;
ALTER FUNCTION public.fn_user_roles_no_truncate() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_user_roles_no_truncate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_roles_no_truncate ON public.user_roles;
CREATE TRIGGER user_roles_no_truncate
  BEFORE TRUNCATE ON public.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_user_roles_no_truncate();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Guarda de user_roles
--    SECURITY DEFINER de propósito (exceção deliberada à regra invoker das
--    RPCs): o cascade de auth.admin.deleteUser dispara este trigger sob o papel
--    interno do Auth, que não tem USAGE em `private`. Owner = dono da migration
--    (postgres), search_path vazio, chamadas qualificadas, EXECUTE revogado.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_user_roles_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Identidade lógica é (user_id, role): mover linha por UPDATE criaria
    -- casos impossíveis de auditar. Erro interno (sem código de contrato:
    -- nenhuma RPC faz UPDATE; isto é defesa contra escrita direta).
    RAISE EXCEPTION 'user_roles é imutável: associações mudam por INSERT/DELETE';
  END IF;

  -- Serializa TODAS as mutações de papéis (INSERT e DELETE), inclusive as que
  -- não passam pelas RPCs — dois "últimos admins" não se removem em paralelo.
  PERFORM private.team_lock_user_roles();

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin'::public.app_role AND NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE role = 'admin'::public.app_role AND id <> OLD.id
    ) THEN
      RAISE EXCEPTION 'não é possível remover o último admin'
        USING ERRCODE = 'T0003';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_user_roles_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_roles_guard ON public.user_roles;
CREATE TRIGGER user_roles_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_user_roles_guard();

-- 4. Auditoria física (mesmo conjunto das tabelas financeiras)
DROP TRIGGER IF EXISTS audit_user_roles ON public.user_roles;
CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. team_operations — registro de domínio + idempotência da saga
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.team_operations (
  operation_id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL,
  action text NOT NULL
    CHECK (action IN ('invite','set_roles','revoke_access','send_recovery')),
  target_email text NULL,
  target_user_id uuid NULL,
  payload_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'started'
    CHECK (status IN ('started','succeeded','partial','failed')),
  outcome text NULL,
  phase text NOT NULL DEFAULT 'preflight'
    CHECK (phase IN ('preflight','invite_requested','auth_user_observed',
                     'role_assigned','recovery_requested','done')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  lease_expires_at timestamptz NULL,
  lease_token uuid NULL,
  taken_over_by uuid NULL,                 -- admin ATUAL que assumiu op órfã (fria T1, achado 2)
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL
);

ALTER TABLE public.team_operations ENABLE ROW LEVEL SECURITY;
-- Service-only: sem policy nenhuma (RLS ligada sem policy = zero acesso via
-- API para anon/authenticated mesmo que um grant futuro escorregue).
REVOKE ALL ON public.team_operations FROM PUBLIC, anon, authenticated;
-- service_role NÃO escreve aqui (fria T1: DML direto = bypass da saga e do
-- fencing). Só a role de capacidade das RPCs.
REVOKE ALL ON public.team_operations FROM service_role;
-- (nem SELECT: lease_token mora aqui — replay/estado vêm SÓ pelas RPCs)
GRANT SELECT, INSERT, UPDATE ON public.team_operations TO team_ops;
DROP POLICY IF EXISTS "team_operations_teamops_all" ON public.team_operations;
CREATE POLICY "team_operations_teamops_all" ON public.team_operations
  FOR ALL TO team_ops USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "team_operations_service_select" ON public.team_operations;

CREATE OR REPLACE FUNCTION public.fn_team_operations_no_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE em team_operations é proibido';
END;
$$;
ALTER FUNCTION public.fn_team_operations_no_truncate() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_team_operations_no_truncate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS team_operations_no_truncate ON public.team_operations;
CREATE TRIGGER team_operations_no_truncate
  BEFORE TRUNCATE ON public.team_operations
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_team_operations_no_truncate();

ALTER TABLE public.team_operations ADD COLUMN IF NOT EXISTS taken_over_by uuid NULL;

CREATE INDEX IF NOT EXISTS idx_team_ops_actor ON public.team_operations (actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_team_ops_target_user ON public.team_operations (target_user_id);
CREATE INDEX IF NOT EXISTS idx_team_ops_target_email ON public.team_operations (target_email);
CREATE INDEX IF NOT EXISTS idx_team_ops_action ON public.team_operations (action, created_at);

-- Máquina de estados (trigger): terminais imutáveis; transições de phase por
-- ação; target_user_id com UMA transição NULL→uuid só em 'started'; lease limpo
-- em terminal. As RPCs cuidam do FENCING (lease_token); aqui é a LEGALIDADE.
CREATE OR REPLACE FUNCTION public.fn_team_operations_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  legal boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'team_operations é append-only';
  END IF;

  -- INSERT também é validado: nenhuma linha nasce em estado impossível
  -- (nem via service_role fora das RPCs).
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'started' OR NEW.phase <> 'preflight'
       OR NEW.finished_at IS NOT NULL OR NEW.outcome IS NOT NULL
       OR NEW.error_code IS NOT NULL
       OR NEW.lease_token IS NULL OR NEW.lease_expires_at IS NULL THEN
      RAISE EXCEPTION 'team_operations: INSERT só nasce started/preflight com lease';
    END IF;
    -- detail nasce vazio SEMPRE (nem service_role fora das RPCs escapa).
    IF NEW.detail <> '{}'::jsonb THEN
      RAISE EXCEPTION 'team_operations: INSERT exige detail vazio';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: o documento COMPLETO passa pela allowlist da ação registrada —
  -- escrita direta por service_role não injeta campo sensível.
  PERFORM private.team_validate_detail(OLD.action, NEW.detail);

  -- Terminal congelado por inteiro.
  IF OLD.status <> 'started' THEN
    RAISE EXCEPTION 'operação % já finalizada (%) — terminal é imutável',
      OLD.operation_id, OLD.status;
  END IF;

  -- Colunas de identidade imutáveis desde o INSERT.
  IF NEW.operation_id  <> OLD.operation_id
     OR NEW.actor_user_id <> OLD.actor_user_id
     OR NEW.action        <> OLD.action
     OR NEW.payload_fingerprint <> OLD.payload_fingerprint
     OR NEW.created_at    <> OLD.created_at
     OR COALESCE(NEW.target_email, '') <> COALESCE(OLD.target_email, '') THEN
    RAISE EXCEPTION 'colunas de identidade de team_operations são imutáveis';
  END IF;

  -- target_user_id: uma única transição NULL→uuid, só enquanto started.
  IF OLD.target_user_id IS NOT NULL
     AND NEW.target_user_id IS DISTINCT FROM OLD.target_user_id THEN
    RAISE EXCEPTION 'target_user_id só admite a transição NULL→uuid';
  END IF;

  -- Status: started → started (progresso de phase/lease) ou started → terminal.
  IF NEW.status = 'started' THEN
    IF NEW.phase = 'done' THEN
      RAISE EXCEPTION 'phase=done exige status terminal';
    END IF;
    IF NEW.finished_at IS NOT NULL THEN
      RAISE EXCEPTION 'finished_at só em terminal';
    END IF;
  ELSE
    IF NEW.phase <> 'done' THEN
      RAISE EXCEPTION 'status terminal exige phase=done';
    END IF;
    IF NEW.finished_at IS NULL THEN
      RAISE EXCEPTION 'terminal exige finished_at';
    END IF;
    IF NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'terminal exige lease limpo';
    END IF;
  END IF;

  -- Matriz de transições de phase, por ação. 'done' só junto de terminal
  -- (garantido acima); regressão de phase nunca.
  IF NEW.phase = OLD.phase THEN
    legal := true;
  ELSIF NEW.phase = 'done' THEN
    legal := true;  -- qualquer phase pode encerrar (falha/saída antecipada)
  ELSE
    CASE OLD.action
      WHEN 'invite' THEN
        legal := (OLD.phase = 'preflight'        AND NEW.phase = 'invite_requested')
              OR (OLD.phase = 'invite_requested' AND NEW.phase = 'auth_user_observed')
              OR (OLD.phase = 'auth_user_observed' AND NEW.phase = 'role_assigned');
      WHEN 'set_roles', 'revoke_access' THEN
        legal := (OLD.phase = 'preflight' AND NEW.phase = 'role_assigned');
      WHEN 'send_recovery' THEN
        legal := (OLD.phase = 'preflight' AND NEW.phase = 'recovery_requested');
    END CASE;
  END IF;

  IF NOT legal THEN
    RAISE EXCEPTION 'transição de phase ilegal para %: % → %',
      OLD.action, OLD.phase, NEW.phase;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_team_operations_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS team_operations_guard ON public.team_operations;
CREATE TRIGGER team_operations_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.team_operations
  FOR EACH ROW EXECUTE FUNCTION public.fn_team_operations_guard();

-- Owner explícito das funções DEFINER (F7: nunca presumido do executor).
ALTER FUNCTION public.fn_user_roles_guard() OWNER TO postgres;
ALTER FUNCTION public.fn_team_operations_guard() OWNER TO postgres;

-- Allowlist do `detail` (R2-21): payload tipado por ação; campos sensíveis
-- são rejeitados SEMPRE, mesmo que uma Edge futura tente gravá-los.
CREATE OR REPLACE FUNCTION private.team_validate_detail(p_action text, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  k text;
  allowed text[];
BEGIN
  IF p_patch IS NULL THEN RETURN; END IF;
  IF jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'detail deve ser objeto';
  END IF;
  allowed := CASE p_action
    WHEN 'invite'        THEN ARRAY['existing_user_id','recoverable']
    WHEN 'set_roles'     THEN ARRAY['roles']
    WHEN 'revoke_access' THEN ARRAY['roles']
    WHEN 'send_recovery' THEN ARRAY[]::text[]
    ELSE ARRAY[]::text[]
  END;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF k = ANY (ARRAY['lease_token','authorization','headers','token',
                      'access_token','refresh_token','action_link','stack']) THEN
      RAISE EXCEPTION 'detail: campo % é proibido', k;
    END IF;
    IF NOT (k = ANY (allowed)) THEN
      RAISE EXCEPTION 'detail: campo % fora da allowlist de %', k, p_action;
    END IF;
  END LOOP;
  IF p_patch ? 'existing_user_id'
     AND (p_patch ->> 'existing_user_id')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'detail.existing_user_id deve ser uuid';
  END IF;
  IF p_patch ? 'recoverable'
     AND jsonb_typeof(p_patch -> 'recoverable') <> 'boolean' THEN
    RAISE EXCEPTION 'detail.recoverable deve ser boolean';
  END IF;
  IF p_patch ? 'roles' THEN
    IF jsonb_typeof(p_patch -> 'roles') <> 'array' THEN
      RAISE EXCEPTION 'detail.roles deve ser array';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_patch -> 'roles') e
               WHERE jsonb_typeof(e.value) <> 'string') THEN
      RAISE EXCEPTION 'detail.roles deve conter apenas strings';
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.team_validate_detail(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.team_validate_detail(text, jsonb) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RPCs da saga (SECURITY DEFINER owner team_ops; EXECUTE de authenticated)
--    Contrato de erros (spec §F10, classe T0 — PTxxx é reservado do PostgREST):
--      T0001 operation_id_conflict   T0002 stale_lease      T0003 last_admin
--      T0004 actor_not_admin         T0005 operation_already_in_progress
--      T0006 use_revoke_access       T0007 cannot_remove_own_admin
--      T0008 student_role_untouchable T0010 operation_in_progress (retry c/ lease vivo)
--      T0011 cooldown_active
-- ────────────────────────────────────────────────────────────────────────────

-- Papéis staff conviáveis/atribuíveis. Student NUNCA (D1/D5).
CREATE OR REPLACE FUNCTION private.team_staff_roles()
RETURNS public.app_role[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT ARRAY['admin','manager','reception','instructor']::public.app_role[]; $$;
REVOKE ALL ON FUNCTION private.team_staff_roles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.team_staff_roles() TO service_role;

-- Revalidação de ator. NÃO usa has_role (self-only desde 08/08: retorna FALSE
-- sob service_role, onde auth.uid() é nulo) — consulta direta qualificada.
CREATE OR REPLACE FUNCTION private.team_require_admin(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_actor AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'ator % não é admin', p_actor USING ERRCODE = 'T0004';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.team_require_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.team_require_admin(uuid) TO service_role;

-- Fencing: carrega a operação com FOR UPDATE e exige lease vigente.
CREATE OR REPLACE FUNCTION private.team_require_lease(p_operation_id uuid, p_lease_token uuid)
RETURNS public.team_operations
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  op public.team_operations;
BEGIN
  SELECT * INTO op FROM public.team_operations
  WHERE operation_id = p_operation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operação % inexistente', p_operation_id USING ERRCODE = 'T0002';
  END IF;
  IF op.status <> 'started'
     OR op.lease_token IS NULL
     OR op.lease_token IS DISTINCT FROM p_lease_token
     OR op.lease_expires_at < now() THEN
    RAISE EXCEPTION 'lease inválido/vencido para %', p_operation_id USING ERRCODE = 'T0002';
  END IF;
  -- Fencing de IDENTIDADE além do token: só o ator efetivo da operação
  -- (original ou quem assumiu) escreve nela — token vazado não basta.
  IF auth.uid() IS NULL
     OR auth.uid() <> COALESCE(op.taken_over_by, op.actor_user_id) THEN
    RAISE EXCEPTION 'requisição não pertence ao ator da operação'
      USING ERRCODE = 'T0012';
  END IF;
  RETURN op;
END;
$$;
REVOKE ALL ON FUNCTION private.team_require_lease(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.team_require_lease(uuid, uuid) TO service_role;

-- begin: idempotência + claim por alvo + cooldown + lease.
-- Retorna jsonb: {kind: 'new'|'replay'|'takeover', lease_token?, op}
CREATE OR REPLACE FUNCTION public.team_begin_operation(
  p_operation_id uuid,
  p_action text,
  p_target_email text,
  p_target_user_id uuid,
  p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  op public.team_operations;
  p_actor uuid;
  new_token uuid;
BEGIN
  -- O ATOR NUNCA é parâmetro (fria T1 r2): deriva do JWT da requisição.
  -- service_role/anon não têm EXECUTE; auth.uid() nulo é rejeitado.
  p_actor := auth.uid();
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'ator ausente no contexto' USING ERRCODE = 'T0004';
  END IF;
  PERFORM private.team_lock_user_roles();
  PERFORM private.team_require_admin(p_actor);

  SELECT * INTO op FROM public.team_operations
  WHERE operation_id = p_operation_id
  FOR UPDATE;

  IF FOUND THEN
    -- Ação e payload têm que bater SEMPRE. O ator tem que bater enquanto o
    -- lease vive; com lease VENCIDO, outro admin ATUAL pode assumir a
    -- operação órfã (ator original rebaixado/apagado não pode deixar a saga
    -- presa pra sempre — fria T1, achado 2). O ator ORIGINAL fica registrado;
    -- quem assumiu vai em taken_over_by.
    IF op.action <> p_action OR op.payload_fingerprint <> p_fingerprint THEN
      RAISE EXCEPTION 'operation_id já usado com outra assinatura'
        USING ERRCODE = 'T0001';
    END IF;
    IF COALESCE(op.taken_over_by, op.actor_user_id) <> p_actor
       AND op.status = 'started' AND op.lease_expires_at >= now() THEN
      RAISE EXCEPTION 'operation_id já usado com outra assinatura'
        USING ERRCODE = 'T0001';
    END IF;
    IF op.status <> 'started' THEN
      RETURN jsonb_build_object('kind', 'replay',
        'op', to_jsonb(op) - 'lease_token');
    END IF;
    IF op.lease_expires_at >= now() THEN
      RAISE EXCEPTION 'operação em andamento' USING ERRCODE = 'T0010';
    END IF;
    -- Lease vencido: takeover com fencing novo — o worker antigo perde a escrita.
    new_token := gen_random_uuid();
    UPDATE public.team_operations
    SET lease_token = new_token,
        lease_expires_at = now() + interval '90 seconds',
        -- ator efetivo passa a ser quem assumiu; o ORIGINAL reassumindo limpa
        -- a marca (NULLIF) — o fencing de identidade sempre aponta pro dono
        -- atual do lease.
        taken_over_by = NULLIF(p_actor, actor_user_id)
    WHERE operation_id = p_operation_id;
    SELECT * INTO op FROM public.team_operations WHERE operation_id = p_operation_id;
    RETURN jsonb_build_object('kind', 'takeover', 'lease_token', new_token,
      'op', to_jsonb(op) - 'lease_token');
  END IF;

  -- Claim por alvo: outra op started com lease vivo pro mesmo (alvo, ação).
  IF EXISTS (
    SELECT 1 FROM public.team_operations o
    WHERE o.status = 'started'
      AND o.lease_expires_at >= now()
      AND o.action = p_action
      AND ((p_target_email IS NOT NULL AND o.target_email = p_target_email)
        OR (p_target_user_id IS NOT NULL AND o.target_user_id = p_target_user_id))
  ) THEN
    RAISE EXCEPTION 'já existe operação em andamento para este alvo'
      USING ERRCODE = 'T0005';
  END IF;

  -- Cooldown de envio de e-mail (send_recovery): 10 min desde o último terminal
  -- do mesmo alvo+ação.
  IF p_action = 'send_recovery' AND EXISTS (
    SELECT 1 FROM public.team_operations o
    WHERE o.action = p_action
      AND o.status <> 'started'
      AND o.finished_at > now() - interval '10 minutes'
      AND ((p_target_email IS NOT NULL AND o.target_email = p_target_email)
        OR (p_target_user_id IS NOT NULL AND o.target_user_id = p_target_user_id))
  ) THEN
    RAISE EXCEPTION 'aguarde antes de reenviar' USING ERRCODE = 'T0011';
  END IF;

  new_token := gen_random_uuid();
  INSERT INTO public.team_operations
    (operation_id, actor_user_id, action, target_email, target_user_id,
     payload_fingerprint, lease_token, lease_expires_at)
  VALUES
    (p_operation_id, p_actor, p_action, p_target_email, p_target_user_id,
     p_fingerprint, new_token, now() + interval '90 seconds');

  SELECT * INTO op FROM public.team_operations WHERE operation_id = p_operation_id;
  RETURN jsonb_build_object('kind', 'new', 'lease_token', new_token,
    'op', to_jsonb(op) - 'lease_token');
END;
$$;

-- advance: progresso de phase/target sob fencing (a legalidade é do trigger;
-- o detail passa pela allowlist da ação REGISTRADA — nunca da alegada).
CREATE OR REPLACE FUNCTION public.team_advance_phase(
  p_operation_id uuid,
  p_lease_token uuid,
  p_new_phase text,
  p_target_user_id uuid DEFAULT NULL,
  p_detail_patch jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  op public.team_operations;
BEGIN
  op := private.team_require_lease(p_operation_id, p_lease_token);
  PERFORM private.team_validate_detail(op.action, p_detail_patch);
  UPDATE public.team_operations
  SET phase = p_new_phase,
      target_user_id = COALESCE(p_target_user_id, target_user_id),
      detail = CASE WHEN p_detail_patch IS NULL THEN detail
                    ELSE detail || p_detail_patch END,
      lease_expires_at = now() + interval '90 seconds'
  WHERE operation_id = p_operation_id;
END;
$$;

-- finalize: NÃO revalida ator (finalizar não concede poder — sem isto, ator
-- rebaixado no meio deixaria a operação presa em started pra sempre). Exige só
-- o lease vigente. Limpa lease; phase=done; terminal.
CREATE OR REPLACE FUNCTION public.team_finalize_operation(
  p_operation_id uuid,
  p_lease_token uuid,
  p_status text,
  p_outcome text,
  p_error_code text DEFAULT NULL,
  p_detail_patch jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  op public.team_operations;
BEGIN
  op := private.team_require_lease(p_operation_id, p_lease_token);
  PERFORM private.team_validate_detail(op.action, p_detail_patch);
  UPDATE public.team_operations
  SET status = p_status,
      outcome = p_outcome,
      error_code = p_error_code,
      phase = 'done',
      detail = CASE WHEN p_detail_patch IS NULL THEN detail
                    ELSE detail || p_detail_patch END,
      lease_token = NULL,
      lease_expires_at = NULL,
      finished_at = now()
  WHERE operation_id = p_operation_id;
  SELECT * INTO op FROM public.team_operations WHERE operation_id = p_operation_id;
  RETURN to_jsonb(op) - 'lease_token';
END;
$$;

-- Atribuição de papel pós-convite. A LIGAÇÃO é com a operação registrada:
-- ator e alvo vêm de team_operations (nunca de parâmetro — um lease de
-- set_roles não serve aqui: action e phase são exigidas).
CREATE OR REPLACE FUNCTION public.team_assign_role_after_invite(
  p_operation_id uuid,
  p_lease_token uuid,
  p_role public.app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  op public.team_operations;
BEGIN
  PERFORM private.team_lock_user_roles();
  op := private.team_require_lease(p_operation_id, p_lease_token);

  IF op.action <> 'invite' THEN
    RAISE EXCEPTION 'operação % não é invite', p_operation_id USING ERRCODE = 'T0001';
  END IF;
  IF op.phase <> 'auth_user_observed' THEN
    RAISE EXCEPTION 'invite em phase % não atribui papel', op.phase USING ERRCODE = 'T0001';
  END IF;
  IF op.target_user_id IS NULL THEN
    RAISE EXCEPTION 'invite sem alvo persistido' USING ERRCODE = 'T0001';
  END IF;

  PERFORM private.team_require_admin(COALESCE(op.taken_over_by, op.actor_user_id));

  IF NOT (p_role = ANY (private.team_staff_roles())) THEN
    RAISE EXCEPTION 'papel % não é staff', p_role USING ERRCODE = 'T0008';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (op.target_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.team_operations
  SET phase = 'role_assigned',
      lease_expires_at = now() + interval '90 seconds'
  WHERE operation_id = p_operation_id;
END;
$$;

-- set_roles: estado-alvo completo dos papéis STAFF (student intocável).
-- INSERT antes de DELETE; guardas de próprio-admin e último-admin. Ator e
-- alvo vêm da OPERAÇÃO registrada; a ação e a phase são exigidas.
CREATE OR REPLACE FUNCTION public.team_set_roles(
  p_operation_id uuid,
  p_lease_token uuid,
  p_roles public.app_role[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  op public.team_operations;
  p_actor uuid;
  p_target uuid;
  wanted public.app_role[];
  r public.app_role;
  final_roles public.app_role[];
BEGIN
  PERFORM private.team_lock_user_roles();
  op := private.team_require_lease(p_operation_id, p_lease_token);

  IF op.action <> 'set_roles' THEN
    RAISE EXCEPTION 'operação % não é set_roles', p_operation_id USING ERRCODE = 'T0001';
  END IF;
  IF op.phase <> 'preflight' THEN
    RAISE EXCEPTION 'set_roles em phase % é ilegal', op.phase USING ERRCODE = 'T0001';
  END IF;
  IF op.target_user_id IS NULL THEN
    RAISE EXCEPTION 'set_roles sem alvo persistido' USING ERRCODE = 'T0001';
  END IF;
  p_actor := COALESCE(op.taken_over_by, op.actor_user_id);
  p_target := op.target_user_id;

  PERFORM private.team_require_admin(p_actor);

  -- Dedup + validação de allowlist.
  SELECT array_agg(DISTINCT x) INTO wanted FROM unnest(p_roles) AS x;
  IF wanted IS NULL OR array_length(wanted, 1) = 0 THEN
    RAISE EXCEPTION 'lista vazia: use revoke_access' USING ERRCODE = 'T0006';
  END IF;
  FOREACH r IN ARRAY wanted LOOP
    IF NOT (r = ANY (private.team_staff_roles())) THEN
      RAISE EXCEPTION 'papel % não é staff', r USING ERRCODE = 'T0008';
    END IF;
  END LOOP;

  -- Auto-remoção de admin proibida no nível de RPC (o trigger cobre o último
  -- admin; isto cobre o auto-lockout de qualquer admin).
  IF p_actor = p_target
     AND EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = p_target AND role = 'admin'::public.app_role)
     AND NOT ('admin'::public.app_role = ANY (wanted)) THEN
    RAISE EXCEPTION 'não remova o próprio papel de admin' USING ERRCODE = 'T0007';
  END IF;

  -- INSERT antes de DELETE (nunca há janela com menos papéis que o alvo).
  INSERT INTO public.user_roles (user_id, role)
  SELECT p_target, x FROM unnest(wanted) AS x
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles
  WHERE user_id = p_target
    AND role = ANY (private.team_staff_roles())   -- student jamais
    AND NOT (role = ANY (wanted));

  SELECT COALESCE(array_agg(role ORDER BY role), '{}') INTO final_roles
  FROM public.user_roles WHERE user_id = p_target;

  UPDATE public.team_operations
  SET phase = 'role_assigned',
      lease_expires_at = now() + interval '90 seconds'
  WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object('user_id', p_target, 'roles', to_jsonb(final_roles));
END;
$$;

-- revoke_access: remove TODOS os papéis staff (student fica). Guardas idem;
-- ator e alvo vêm da operação registrada.
CREATE OR REPLACE FUNCTION public.team_revoke_access(
  p_operation_id uuid,
  p_lease_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  op public.team_operations;
  p_actor uuid;
  p_target uuid;
  final_roles public.app_role[];
BEGIN
  PERFORM private.team_lock_user_roles();
  op := private.team_require_lease(p_operation_id, p_lease_token);

  IF op.action <> 'revoke_access' THEN
    RAISE EXCEPTION 'operação % não é revoke_access', p_operation_id USING ERRCODE = 'T0001';
  END IF;
  IF op.phase <> 'preflight' THEN
    RAISE EXCEPTION 'revoke_access em phase % é ilegal', op.phase USING ERRCODE = 'T0001';
  END IF;
  IF op.target_user_id IS NULL THEN
    RAISE EXCEPTION 'revoke_access sem alvo persistido' USING ERRCODE = 'T0001';
  END IF;
  p_actor := COALESCE(op.taken_over_by, op.actor_user_id);
  p_target := op.target_user_id;

  PERFORM private.team_require_admin(p_actor);

  IF p_actor = p_target THEN
    RAISE EXCEPTION 'não revogue o próprio acesso' USING ERRCODE = 'T0007';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_target
    AND role = ANY (private.team_staff_roles());

  SELECT COALESCE(array_agg(role ORDER BY role), '{}') INTO final_roles
  FROM public.user_roles WHERE user_id = p_target;

  UPDATE public.team_operations
  SET phase = 'role_assigned',
      lease_expires_at = now() + interval '90 seconds'
  WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object('user_id', p_target, 'roles', to_jsonb(final_roles));
END;
$$;

-- Grants das RPCs públicas: EXECUTE de authenticated (gate interno via auth.uid);
-- service_role e anon FORA.
DO $grants$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.team_begin_operation(uuid, text, text, uuid, text)',
    'public.team_advance_phase(uuid, uuid, text, uuid, jsonb)',
    'public.team_finalize_operation(uuid, uuid, text, text, text, jsonb)',
    'public.team_assign_role_after_invite(uuid, uuid, public.app_role)',
    'public.team_set_roles(uuid, uuid, public.app_role[])',
    'public.team_revoke_access(uuid, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', fn);
    -- Quem executa é o USUÁRIO autenticado (o gate de admin é auth.uid() +
    -- team_require_admin DENTRO da função); quem escreve é team_ops (owner
    -- DEFINER). service_role não executa nem escreve — sem bypass, sem
    -- impersonação, sem autoria falsa.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('ALTER FUNCTION %s OWNER TO team_ops', fn);
  END LOOP;
END;
$grants$;

-- team_ops precisa executar as auxiliares privadas (as DEFINER rodam como ela).
DO $pgrants$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'private.team_lock_user_roles()',
    'private.team_staff_roles()',
    'private.team_require_admin(uuid)',
    'private.team_require_lease(uuid, uuid)',
    'private.team_validate_detail(text, jsonb)'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO team_ops', fn);
  END LOOP;
END;
$pgrants$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Pós-condições: a migration aborta se qualquer promessa falhou.
-- ────────────────────────────────────────────────────────────────────────────

DO $post$
BEGIN
  -- authenticated não escreve user_roles nem team_operations
  IF has_table_privilege('authenticated', 'public.user_roles', 'INSERT')
     OR has_table_privilege('authenticated', 'public.user_roles', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.user_roles', 'DELETE') THEN
    RAISE EXCEPTION 'pós-condição: authenticated ainda escreve user_roles';
  END IF;
  IF has_table_privilege('authenticated', 'public.team_operations', 'SELECT')
     OR has_table_privilege('anon', 'public.team_operations', 'SELECT') THEN
    RAISE EXCEPTION 'pós-condição: team_operations legível por cliente';
  END IF;
  IF has_table_privilege('service_role', 'public.team_operations', 'DELETE')
     OR has_table_privilege('service_role', 'public.team_operations', 'TRUNCATE')
     OR has_table_privilege('service_role', 'public.team_operations', 'INSERT')
     OR has_table_privilege('service_role', 'public.team_operations', 'UPDATE') THEN
    RAISE EXCEPTION 'pós-condição: service_role ainda escreve team_operations';
  END IF;
  IF has_table_privilege('service_role', 'public.user_roles', 'INSERT')
     OR has_table_privilege('service_role', 'public.user_roles', 'UPDATE')
     OR has_table_privilege('service_role', 'public.user_roles', 'DELETE')
     OR has_table_privilege('service_role', 'public.user_roles', 'TRUNCATE') THEN
    RAISE EXCEPTION 'pós-condição: service_role ainda escreve/trunca user_roles';
  END IF;
  IF has_table_privilege('authenticated', 'public.user_roles', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.user_roles', 'TRUNCATE') THEN
    RAISE EXCEPTION 'pós-condição: cliente ainda trunca user_roles';
  END IF;
  IF NOT has_table_privilege('team_ops', 'public.user_roles', 'INSERT')
     OR NOT has_table_privilege('team_ops', 'public.team_operations', 'UPDATE') THEN
    RAISE EXCEPTION 'pós-condição: team_ops sem os privilégios de capacidade';
  END IF;
  -- as 6 RPCs são DEFINER e pertencem a team_ops
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid IN (
      'public.team_begin_operation(uuid, text, text, uuid, text)'::regprocedure,
      'public.team_advance_phase(uuid, uuid, text, uuid, jsonb)'::regprocedure,
      'public.team_finalize_operation(uuid, uuid, text, text, text, jsonb)'::regprocedure,
      'public.team_assign_role_after_invite(uuid, uuid, public.app_role)'::regprocedure,
      'public.team_set_roles(uuid, uuid, public.app_role[])'::regprocedure,
      'public.team_revoke_access(uuid, uuid)'::regprocedure)
      AND (NOT p.prosecdef OR p.proowner <> (SELECT oid FROM pg_roles WHERE rolname = 'team_ops'))
  ) THEN
    RAISE EXCEPTION 'pós-condição: RPC sem DEFINER/owner team_ops';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.user_roles'::regclass
                   AND tgname = 'user_roles_no_truncate') THEN
    RAISE EXCEPTION 'pós-condição: trigger anti-TRUNCATE ausente em user_roles';
  END IF;
  -- SELECT de user_roles preservado (RLS continua filtrando)
  IF NOT has_table_privilege('authenticated', 'public.user_roles', 'SELECT') THEN
    RAISE EXCEPTION 'pós-condição: SELECT de user_roles sumiu';
  END IF;
  -- RLS ligada em team_operations
  IF NOT (SELECT relrowsecurity FROM pg_class
          WHERE oid = 'public.team_operations'::regclass) THEN
    RAISE EXCEPTION 'pós-condição: RLS desligada em team_operations';
  END IF;
  -- schema private: service_role usa; authenticated não
  IF NOT has_schema_privilege('service_role', 'private', 'USAGE')
     OR has_schema_privilege('authenticated', 'private', 'USAGE') THEN
    RAISE EXCEPTION 'pós-condição: privilégios do schema private errados';
  END IF;
  -- RPCs: authenticated executa (gate interno); service_role e anon não
  IF has_function_privilege('service_role',
       'public.team_set_roles(uuid, uuid, public.app_role[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.team_set_roles(uuid, uuid, public.app_role[])', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.team_set_roles(uuid, uuid, public.app_role[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'pós-condição: privilégios das RPCs errados';
  END IF;
  IF has_table_privilege('service_role', 'public.team_operations', 'SELECT') THEN
    RAISE EXCEPTION 'pós-condição: service_role ainda lê team_operations (lease_token!)';
  END IF;
  -- triggers presentes
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.user_roles'::regclass
                   AND tgname = 'user_roles_guard') THEN
    RAISE EXCEPTION 'pós-condição: trigger user_roles_guard ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.team_operations'::regclass
                   AND tgname = 'team_operations_guard') THEN
    RAISE EXCEPTION 'pós-condição: trigger team_operations_guard ausente';
  END IF;
END;
$post$;
