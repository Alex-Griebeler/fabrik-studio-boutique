import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleMatchBankTransactions } from "../_shared/bank/matchBankTransactions.ts";

/**
 * Matching inteligente: cruza transacoes bancarias nao conciliadas com
 * invoices (creditos) e expenses (debitos) pendentes.
 *
 * Exige staff `admin`/`manager` (ou service_role interno): sem credencial
 * valida => 401, autenticado sem role => 403. Sem `auto_apply: true` a
 * chamada e somente leitura.
 *
 * A implementacao vive em `_shared/bank/` para ficar sem import de VALOR do
 * SDK e assim ser coberta por teste (o `createClient` entra por injecao).
 */
Deno.serve((req) => handleMatchBankTransactions(req, { createClient }));
