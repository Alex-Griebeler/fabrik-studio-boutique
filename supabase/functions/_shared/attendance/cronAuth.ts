import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const ATTENDANCE_CRON_SECRET_HEADER = "x-attendance-agent-cron-secret";

export async function hasValidAttendanceCronSecret(
  req: Request,
  supabase: SupabaseClient,
): Promise<boolean> {
  const provided = req.headers.get(ATTENDANCE_CRON_SECRET_HEADER)?.trim();
  if (!provided) return false;

  const { data, error } = await supabase
    .from("attendance_agent_runtime_config")
    .select("value")
    .eq("key", "cron_secret")
    .maybeSingle();

  if (error || !data?.value) {
    console.warn(
      "attendance cron auth unavailable:",
      error?.message ?? "missing cron_secret",
    );
    return false;
  }

  return timingSafeEqual(provided, data.value);
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;

  for (let i = 0; i < length; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }

  return diff === 0;
}
