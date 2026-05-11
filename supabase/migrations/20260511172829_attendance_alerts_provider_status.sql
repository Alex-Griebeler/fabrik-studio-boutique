-- =============================================================
-- Provider delivery status pra mensagens do agente de faltas.
-- =============================================================
-- Adiciona 8 colunas em `attendance_alerts` pra armazenar o status
-- de entrega reportado pela Twilio (consultado pela função
-- `refresh-attendance-message-status` em dry-run/live).
--
-- Não toca em dados existentes, RLS, grants, triggers, nem em
-- `message_sid`/`notified_at`/`status` — só adiciona colunas
-- opcionais. Não contém segredo.
-- =============================================================

ALTER TABLE public.attendance_alerts
  ADD COLUMN IF NOT EXISTS message_provider_status         text,
  ADD COLUMN IF NOT EXISTS message_provider_error_code     text,
  ADD COLUMN IF NOT EXISTS message_provider_error_message  text,
  ADD COLUMN IF NOT EXISTS message_provider_checked_at     timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_provider_status        text,
  ADD COLUMN IF NOT EXISTS escalation_provider_error_code    text,
  ADD COLUMN IF NOT EXISTS escalation_provider_error_message text,
  ADD COLUMN IF NOT EXISTS escalation_provider_checked_at    timestamptz;
