import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCalculateInvoicePenalties } from "../_shared/finance/calculateInvoicePenalties.ts";

/**
 * Calcula multa e juros para cobranças DCC vencidas.
 * Executada diariamente via Cron.
 *
 * Regras padrão (configuráveis via tabela policies):
 * - Multa: 2% do valor (aplicada uma vez, quando vence)
 * - Juros: 0,033% ao dia (max 1% ao mês)
 * - Status muda para "overdue" automaticamente
 *
 * IMPORTANTE: Apenas cobranças do tipo DCC recebem penalidades.
 *
 * Sem credencial válida => 401 (cron secret ou service_role). Aceita
 * `{"validateOnly": true}` para calcular sem gravar.
 */
Deno.serve((req) => handleCalculateInvoicePenalties(req, { createClient }));
