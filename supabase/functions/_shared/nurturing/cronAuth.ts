import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isNurturingCronSecret, timingSafeEqual } from "./logic.ts";

export const NURTURING_CRON_SECRET_HEADER = "x-nurturing-cron-secret";

export async function hasValidNurturingCronSecret(
  req: Request,
  supabase: SupabaseClient,
): Promise<boolean> {
  const provided = req.headers.get(NURTURING_CRON_SECRET_HEADER)?.trim();
  if (!provided || !isNurturingCronSecret(provided)) return false;

  const { data, error } = await supabase
    .from("nurturing_runtime_config")
    .select("value")
    .eq("key", "cron_secret")
    .maybeSingle();

  if (error || !data?.value) {
    console.warn(
      "nurturing cron auth unavailable",
      error?.message ?? "missing cron_secret",
    );
    return false;
  }

  return timingSafeEqual(provided, data.value);
}
