import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleGenerateMonthlyInvoices } from "../_shared/finance/generateMonthlyInvoices.ts";

/**
 * Gera cobranças para contratos.
 *
 * Dois modos de operação:
 * 1. "contract-created": recebe contract_id e gera cobranças conforme payment_method
 * 2. "cron" (default): verifica cobranças scheduled cuja data chegou + despesas recorrentes
 *
 * Sem credencial válida => 401. São aceitos: cron secret, service_role e
 * usuário staff com role `admin` (o app chama este modo ao criar contrato).
 * Aceita `{"validateOnly": true}` para conferir sem gravar.
 */
Deno.serve((req) => handleGenerateMonthlyInvoices(req, { createClient }));
