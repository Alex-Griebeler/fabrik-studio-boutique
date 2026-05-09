import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isWithinSendWindow } from "../_shared/attendance/detection.ts";
import {
  buildEscalationMessage,
  type EscalationMessageContext,
} from "../_shared/attendance/messaging.ts";
import { hasValidAttendanceCronSecret } from "../_shared/attendance/cronAuth.ts";
import { shouldEscalate } from "../_shared/attendance/escalation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function isServiceRoleJwt(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.role === "service_role";
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    const cronAuthorized = await hasValidAttendanceCronSecret(req, supabase);
    if (!authHeader.startsWith("Bearer ")) {
      if (!cronAuthorized) return j(401, { error: "Missing Authorization" });
    } else {
      const token = authHeader.replace("Bearer ", "");
      if (token !== serviceKey && !isServiceRoleJwt(token) && !cronAuthorized) {
        return j(403, { error: "Service-role required" });
      }
    }

    const policies = await loadPolicies(supabase);
    const nowInTz = nowInTimezone(policies.timezone);
    const inSendWindow = isWithinSendWindow(nowInTz, {
      startHour: policies.sendWindow.start_hour,
      endHour: policies.sendWindow.end_hour,
      daysOfWeek: policies.sendWindow.days_of_week,
    });

    if (!inSendWindow) {
      return j(200, { skipped: "outside_send_window" });
    }

    if (!policies.fallbackTrainerId) {
      return j(200, {
        skipped: "no_fallback_trainer",
        hint: "Configure attendance_agent.fallback_trainer_id pra escalar pra Raquel.",
      });
    }

    // Fallback trainer (Raquel)
    const { data: fallbackTrainer, error: fbErr } = await supabase
      .from("trainers")
      .select("id, full_name, phone, is_active")
      .eq("id", policies.fallbackTrainerId)
      .maybeSingle();
    if (fbErr) throw new Error(`fallback trainer: ${fbErr.message}`);
    if (!fallbackTrainer || !fallbackTrainer.is_active) {
      return j(200, { skipped: "fallback_inactive" });
    }

    // Carrega alertas pending sem ack/escalada. A decisão temporal fica no
    // helper puro testado, que prefere notified_at e usa created_at quando
    // a notificação ainda não saiu.
    const { data: alerts, error: aErr } = await supabase
      .from("attendance_alerts")
      .select(
        "id, student_id, trainer_id, status, mode, missed_dates, last_attended_at, plan_snapshot, ack_token, notified_at, created_at, acknowledged_at, escalated_at, student:students(full_name), trainer:trainers!attendance_alerts_trainer_id_fkey(full_name)",
      )
      .eq("status", "pending")
      .is("acknowledged_at", null)
      .is("escalated_at", null)
      .order("created_at", { ascending: true })
      .limit(500);
    if (aErr) throw new Error(`load alerts: ${aErr.message}`);

    type Row = {
      id: string;
      student_id: string;
      trainer_id: string | null;
      status: "pending" | "escalated";
      mode: "shadow" | "live";
      missed_dates: string[];
      last_attended_at: string | null;
      plan_snapshot: { plan_name?: string; frequency?: string | null } | null;
      ack_token: string;
      notified_at: string | null;
      created_at: string;
      acknowledged_at: string | null;
      escalated_at: string | null;
      student: { full_name: string } | null;
      trainer: { full_name: string } | null;
    };

    const eligibleAlerts = ((alerts ?? []) as unknown as Row[]).filter((a) =>
      shouldEscalate(a, {
        now: new Date(),
        escalationHours: policies.escalationHours,
      }).escalate,
    );

    const summary = {
      candidates: eligibleAlerts.length,
      escalated: 0,
      errors: [] as string[],
    };

    if (eligibleAlerts.length === 0) return j(200, summary);

    const ackBaseUrl = `${supabaseUrl}/functions/v1/acknowledge-attendance-alert`;

    for (const a of eligibleAlerts) {
      try {
        const ackUrl = `${ackBaseUrl}?token=${a.ack_token}`;
        const planLabel = formatPlanLabel(a.plan_snapshot);
        const trainerName = a.trainer?.full_name ?? "treinador";

        const ctx: EscalationMessageContext = {
          studentName: a.student?.full_name ?? "aluno",
          planLabel,
          lastAttendedAt: a.last_attended_at,
          missedDates: a.missed_dates,
          ackUrl,
          alertType: "group_2_misses",
          trainerName,
          hoursOpen: policies.escalationHours,
        };
        const message = buildEscalationMessage(ctx);

        // Destino: shadow_phone em modo shadow, fallback.phone em modo live
        const targetPhone =
          a.mode === "shadow"
            ? policies.shadowPhone || null
            : fallbackTrainer.phone || null;

        if (!targetPhone) {
          summary.errors.push(`alert ${a.id}: no target phone`);
          continue;
        }

        const sent = await sendWhatsapp(supabaseUrl, serviceKey, targetPhone, message);

        const { error: updErr } = await supabase
          .from("attendance_alerts")
          .update({
            status: "escalated",
            escalated_at: new Date().toISOString(),
            escalated_to_trainer_id: fallbackTrainer.id,
            escalation_message_sid: sent.sid,
          })
          .eq("id", a.id);
        if (updErr) {
          summary.errors.push(`update ${a.id}: ${updErr.message}`);
          continue;
        }
        summary.escalated++;
      } catch (err) {
        summary.errors.push(`alert ${a.id}: ${(err as Error).message}`);
      }
    }

    return j(200, summary);
  } catch (err) {
    console.error("escalate-attendance-alerts fatal:", err);
    return j(500, { error: (err as Error).message });
  }
});

// ─────────── Helpers ───────────

interface AgentPolicies {
  shadowPhone: string;
  escalationHours: number;
  fallbackTrainerId: string | null;
  sendWindow: { start_hour: number; end_hour: number; days_of_week: number[] };
  timezone: string;
}

async function loadPolicies(supabase: SupabaseClient): Promise<AgentPolicies> {
  const keys = [
    "attendance_agent.shadow_phone",
    "attendance_agent.escalation_hours",
    "attendance_agent.fallback_trainer_id",
    "attendance_agent.send_window",
    "attendance_agent.timezone",
  ];
  const { data, error } = await supabase
    .from("policies")
    .select("key, value")
    .in("key", keys);
  if (error) throw new Error(`load policies: ${error.message}`);
  const map = new Map<string, unknown>(
    (data ?? []).map((r) => [r.key as string, r.value]),
  );
  return {
    shadowPhone: (map.get("attendance_agent.shadow_phone") as string) ?? "",
    escalationHours:
      (map.get("attendance_agent.escalation_hours") as number) ?? 24,
    fallbackTrainerId:
      (map.get("attendance_agent.fallback_trainer_id") as string | null) ?? null,
    sendWindow:
      (map.get("attendance_agent.send_window") as AgentPolicies["sendWindow"]) ?? {
        start_hour: 9,
        end_hour: 19,
        days_of_week: [1, 2, 3, 4, 5],
      },
    timezone:
      (map.get("attendance_agent.timezone") as string) ?? "America/Sao_Paulo",
  };
}

function formatPlanLabel(
  plan: { plan_name?: string; frequency?: string | null } | null,
): string {
  if (!plan?.plan_name) return "Sem plano ativo";
  if (plan.frequency) return `${plan.plan_name} (${plan.frequency})`;
  return plan.plan_name;
}

async function sendWhatsapp(
  supabaseUrl: string,
  serviceKey: string,
  to: string,
  message: string,
): Promise<{ sid: string | null }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ to, message }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`send-whatsapp ${res.status}: ${text}`);
  }
  const json = (await res.json().catch(() => ({}))) as {
    sid?: string;
    messageSid?: string;
  };
  return { sid: json.sid ?? json.messageSid ?? null };
}

function nowInTimezone(timezone: string): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

function j(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
