import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleDailyFinanceCron } from "../_shared/finance/dailyFinanceCron.ts";

/**
 * Cron diário financeiro — executa:
 * 1. Marca cobranças pendentes como "overdue" se vencidas
 * 2. Gera despesas recorrentes cujo próximo vencimento já chegou
 * 3. Ativa cobranças DCC "scheduled" cuja data agendada chegou
 *
 * Disparado via pg_cron diariamente às 06:00 UTC, autenticado com o header
 * `x-finance-cron-secret` (ver migration a1_finance_fail_closed).
 *
 * Sem credencial válida => 401. Aceita `{"validateOnly": true}` para
 * conferir o conjunto de trabalho sem gravar nada.
 *
 * A implementação vive em `_shared/finance/` para ficar sem import de VALOR
 * do SDK e assim ser coberta por teste (o `createClient` entra por injeção).
 */
Deno.serve((req) => handleDailyFinanceCron(req, { createClient }));
