// Pinado (F8 da fria): a spec depende de comportamento fino da Admin API
// (inviteUserByEmail/updateUserById/app_metadata) e não aceita drift do
// `@2` flutuante. 2.111.0 = a versão do deno.lock da CI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import {
  handleManageTeam,
  type TeamAuthAdminApi,
} from "../_shared/team/manageTeam.ts";

/**
 * Gestão de colaboradores (tela /team): list, invite, set_roles,
 * revoke_access, send_recovery.
 *
 * Exige JWT de staff `admin`: sem credencial => 401, sem role => 403; bearer
 * de service_role não é aceito (autor humano sempre registrado). As guardas
 * de verdade (último admin, student intocável, lease/fencing, idempotência)
 * moram no BANCO — RPCs transacionais service-only da migration
 * 20260812150000. A implementação vive em `_shared/team/` para ficar sem
 * import de VALOR do SDK e assim ser coberta por teste.
 */
Deno.serve((req) =>
  handleManageTeam(req, {
    createClient,
    getAuthAdmin: (auth) =>
      // deno-lint-ignore no-explicit-any
      (auth.adminClient as any).auth.admin as TeamAuthAdminApi,
    sendRecoveryEmail: async (email, redirectTo) => {
      // Cliente DEDICADO com anon key (F5): /recover é endpoint público do
      // Auth — service key não o toca e não dá bypass de rate limit.
      const url = Deno.env.get("SUPABASE_URL");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
      if (!url || !anonKey) return { error: { message: "env ausente" } };
      const recovery = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await recovery.auth.resetPasswordForEmail(email, { redirectTo });
      return { error: error ? { message: error.message } : null };
    },
    getAppUrl: () => Deno.env.get("APP_URL"),
  })
);
