-- =============================================================
-- attendance_alerts — coluna de provider por mensagem.
-- =============================================================
-- Distingue de qual canal veio cada SID gravado:
--   - `message_provider`     pro SID em `message_sid`
--   - `escalation_provider`  pro SID em `escalation_message_sid`
--
-- Necessário pra Fase 4 da migração Twilio → Meta: o webhook de
-- status da Meta (`receive-whatsapp-meta`) e o
-- `refresh-attendance-message-status` precisam saber se um SID é
-- Twilio (`SM...`, consulta via GET REST) ou Meta (`wamid...`, status
-- chega via webhook push, sem pull).
--
-- Aditiva e idempotente:
--   - colunas nullable, sem default forçado
--   - CHECK só restringe valores não-nulos a ('twilio','meta')
--   - backfill marca como 'twilio' as linhas que JÁ têm SID e provider
--     nulo (todo histórico até aqui é Twilio sandbox)
--
-- NÃO toca em: RLS, status, notified_at, escalated_at,
-- acknowledged_at, mode, nem nas 8 colunas `*_provider_status/_error_*`.
-- =============================================================

ALTER TABLE public.attendance_alerts
  ADD COLUMN IF NOT EXISTS message_provider    text,
  ADD COLUMN IF NOT EXISTS escalation_provider text;

-- CHECK idempotente: valor não-nulo só pode ser twilio | meta.
DO $$ BEGIN
  ALTER TABLE public.attendance_alerts
    ADD CONSTRAINT attendance_alerts_message_provider_chk
    CHECK (message_provider IS NULL OR message_provider IN ('twilio', 'meta'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.attendance_alerts
    ADD CONSTRAINT attendance_alerts_escalation_provider_chk
    CHECK (escalation_provider IS NULL OR escalation_provider IN ('twilio', 'meta'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill seguro: histórico com SID = Twilio (sandbox). Só toca
-- linhas com provider ainda nulo — reexecução é no-op.
UPDATE public.attendance_alerts
   SET message_provider = 'twilio'
 WHERE message_sid IS NOT NULL
   AND message_provider IS NULL;

UPDATE public.attendance_alerts
   SET escalation_provider = 'twilio'
 WHERE escalation_message_sid IS NOT NULL
   AND escalation_provider IS NULL;
