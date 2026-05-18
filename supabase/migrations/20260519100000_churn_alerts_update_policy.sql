-- =============================================================
-- churn_alerts — UPDATE manual pelo staff (ack/resolve/suppress).
-- =============================================================
-- A tabela `churn_alerts` foi criada com SELECT policies +
-- GRANT SELECT (migration 20260518181853_churn_alerts_read_grant.sql),
-- mas NENHUMA permissão de UPDATE. RLS habilitada + sem policy ⇒
-- toda mutação do frontend é bloqueada (correto até agora, modo
-- read-only).
--
-- Esta migration habilita ações MANUAIS na UI (/alertas-churn):
--   1) GRANT UPDATE EXPLÍCITO só nas colunas (status, acknowledged_at,
--      resolved_at) — qualquer tentativa de mexer em mode, confidence,
--      data_*, médias etc. é rejeitada pelo Postgres antes mesmo da
--      policy rodar. Mais estrito que o padrão de attendance_alerts,
--      mas espelha a regra do spec: "não permitir atualizar campos
--      fora dos listados".
--   2) POLICY de UPDATE pra staff (admin/manager/reception). Treinador
--      NÃO atualiza nesta fase (mantém SELECT-only).
--
-- Não mexe nas SELECT policies. Não cria INSERT/DELETE. Service_role
-- continua bypassando RLS (uso pelas edge functions).
--
-- O trigger `set_churn_alerts_updated_at` continua atualizando
-- `updated_at` automaticamente — triggers rodam com privilégio do
-- owner, alheios ao grant de coluna.
-- =============================================================

-- 1) Column-level GRANT: só os 3 campos manipulados pelas mutations.
GRANT UPDATE (status, acknowledged_at, resolved_at)
  ON public.churn_alerts
  TO authenticated;

-- 2) Policy de UPDATE pra staff. Idempotente.
DO $$ BEGIN
  CREATE POLICY churn_alerts_update_staff
    ON public.churn_alerts
    FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'manager', 'reception')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'manager', 'reception')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
