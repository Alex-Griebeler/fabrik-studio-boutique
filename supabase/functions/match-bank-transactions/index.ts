import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleMatchBankTransactions } from "../_shared/bank/matchBankTransactions.ts";

/**
 * Sugestão de vínculos: cruza transacoes bancarias nao conciliadas com
 * invoices (creditos) e expenses (debitos) pendentes.
 *
 * Exige JWT de staff `admin`: sem credencial valida => 401, autenticado sem
 * role => 403. Bearer de service_role nao e aceito (nao ha chamador interno).
 *
 * Desde a Onda 2c-1 é SOMENTE-SUGESTÃO: nenhuma escrita, em nenhum caminho.
 * `auto_apply` deixou de existir (enviar true => 400). A aplicação de vínculo
 * vira RPC transacional na 2c-3.
 *
 * A implementacao vive em `_shared/bank/` para ficar sem import de VALOR do
 * SDK e assim ser coberta por teste (o `createClient` entra por injecao).
 */
Deno.serve((req) => handleMatchBankTransactions(req, { createClient }));
