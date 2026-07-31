import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { hasValidNurturingCronSecret } from "../_shared/nurturing/cronAuth.ts";
import {
  nurturingIdempotencyKey,
  normalizeRequestId,
  parseNurturingRequest,
  renderNurturingMessage,
} from "../_shared/nurturing/logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // O segredo de cron nao e liberado em CORS: esta funcao e service-to-service.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const requestId = normalizeRequestId(req.headers.get("x-request-id"));
  const responseHeaders = {
    ...corsHeaders,
    "Content-Type": "application/json",
    "x-request-id": requestId,
  };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed", request_id: requestId }), {
      status: 405,
      headers: responseHeaders,
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing server configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    if (!await hasValidNurturingCronSecret(req, supabase)) {
      return new Response(JSON.stringify({ error: "Unauthorized", request_id: requestId }), {
        status: 401,
        headers: responseHeaders,
      });
    }

    const body = await req.json().catch(() => ({}));
    const { dryRun, limit } = parseNurturingRequest(body);

    // Find executions ready to run
    const { data: readyExecutions, error: execError } = await supabase
      .from("sequence_executions")
      .select("*, nurturing_sequences:sequence_id(name), leads:lead_id(name, phone, email)")
      .eq("status", "running")
      .lte("next_step_at", new Date().toISOString())
      .order("next_step_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);

    if (execError) throw execError;

    const results = [];

    for (const execution of (readyExecutions || [])) {
      try {
        // Get the next step by order
        const { data: steps, error: stepsError } = await supabase
          .from("sequence_steps")
          .select("*")
          .eq("sequence_id", execution.sequence_id)
          .order("step_number", { ascending: true });
        if (stepsError) throw stepsError;
        
        const step = steps?.[execution.current_step] || null;

        if (!step) {
          if (!dryRun) await completeExecution(supabase, execution);
          results.push({
            execution_id: execution.id,
            status: dryRun ? "would_complete" : "completed",
          });
          continue;
        }

        const lead = execution.leads as Record<string, string | null>;
        const messageContent = renderNurturingMessage(step.message_content, lead ?? {});
        const idempotencyKey = nurturingIdempotencyKey(execution.id, step.id);

        const { data: keyedEvent, error: priorEventError } = await supabase
          .from("sequence_step_events")
          .select("id,event_type")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (priorEventError) throw priorEventError;

        // Compatibilidade com eventos criados antes do P0-4, que ainda nao
        // possuem idempotency_key. Sem este fallback uma etapa ja enviada
        // poderia ser reenviada logo apos o deploy.
        let priorEvent = keyedEvent;
        if (!priorEvent) {
          const { data: legacyEvents, error: legacyEventError } = await supabase
            .from("sequence_step_events")
            .select("id,event_type")
            .eq("execution_id", execution.id)
            .eq("step_id", step.id)
            .eq("event_type", "sent")
            .limit(1);
          if (legacyEventError) throw legacyEventError;
          priorEvent = legacyEvents?.[0] ?? null;
        }

        if (priorEvent) {
          if (!dryRun && priorEvent.event_type === "sent") {
            await advanceExecution(supabase, execution, steps ?? []);
          }
          results.push({
            execution_id: execution.id,
            step_id: step.id,
            idempotency_key: idempotencyKey,
            status: priorEvent.event_type === "sent" ? "already_sent" : "already_claimed",
          });
          continue;
        }

        if (dryRun) {
          results.push({
            execution_id: execution.id,
            step_id: step.id,
            idempotency_key: idempotencyKey,
            status: "would_send",
          });
          continue;
        }

        const { data: claimedEvent, error: claimError } = await supabase
          .from("sequence_step_events")
          .insert({
            execution_id: execution.id,
            step_id: step.id,
            event_type: "processing",
            idempotency_key: idempotencyKey,
            request_id: requestId,
          })
          .select("id")
          .single();

        if (claimError) {
          if (claimError.code === "23505") {
            results.push({
              execution_id: execution.id,
              step_id: step.id,
              idempotency_key: idempotencyKey,
              status: "already_claimed",
            });
            continue;
          }
          throw claimError;
        }

        let providerMessageId: string | null;
        try {
          providerMessageId = await sendStep(
            supabase,
            step,
            lead ?? {},
            messageContent,
          );
        } catch (sendError) {
          const message = sendError instanceof Error ? sendError.message : String(sendError);
          await supabase.from("sequence_step_events").update({
            event_type: "failed",
            error: message.slice(0, 500),
            updated_at: new Date().toISOString(),
          }).eq("id", claimedEvent.id);
          throw sendError;
        }

        // Depois que o provider confirmou o envio, nunca rebaixe o evento para
        // failed. Se o avanco da execucao falhar, a proxima rodada encontra
        // event_type=sent e reconcilia o ponteiro sem reenviar a mensagem.
        const { error: sentEventError } = await supabase
          .from("sequence_step_events")
          .update({
            event_type: "sent",
            provider_message_id: providerMessageId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", claimedEvent.id);
        if (sentEventError) throw sentEventError;

        await advanceExecution(supabase, execution, steps ?? []);
        results.push({
          execution_id: execution.id,
          step_id: step.id,
          idempotency_key: idempotencyKey,
          status: "sent",
        });
      } catch (stepError) {
        console.error("nurturing step failed", {
          request_id: requestId,
          execution_id: execution.id,
          error: stepError instanceof Error ? stepError.message : String(stepError),
        });
        results.push({ execution_id: execution.id, status: "error", error: String(stepError) });
      }
    }

    const errors = results.filter((result) => result.status === "error").length;
    console.info("nurturing run completed", {
      request_id: requestId,
      dry_run: dryRun,
      processed: results.length,
      errors,
    });

    return new Response(JSON.stringify({
      request_id: requestId,
      dry_run: dryRun,
      processed: results.length,
      errors,
      results,
    }), {
      status: errors > 0 ? 207 : 200,
      headers: responseHeaders,
    });
  } catch (e) {
    console.error("execute-nurturing-step error", {
      request_id: requestId,
      error: e instanceof Error ? e.message : String(e),
    });
    return new Response(JSON.stringify({
      error: "Internal error",
      request_id: requestId,
    }), {
      status: 500,
      headers: responseHeaders,
    });
  }
});

async function sendStep(
  supabase: AdminClient,
  step: Record<string, unknown>,
  lead: Record<string, string | null>,
  messageContent: string,
): Promise<string | null> {
  if (step.channel !== "whatsapp") {
    throw new Error(`Unsupported nurturing channel: ${String(step.channel)}`);
  }
  if (!lead.phone) throw new Error("Lead has no phone");

  const { data, error } = await supabase.functions.invoke("send-whatsapp", {
    body: { to: lead.phone, message: messageContent },
  });
  if (error) throw new Error(`send-whatsapp failed: ${error.message}`);
  if (!data?.success) throw new Error("send-whatsapp did not confirm success");
  return typeof data.sid === "string" ? data.sid : null;
}

async function advanceExecution(
  supabase: AdminClient,
  execution: ExecutionRow,
  steps: StepRow[],
): Promise<void> {
  const nextStep = steps[execution.current_step + 1];
  const now = new Date();
  const update = nextStep
    ? {
      current_step: execution.current_step + 1,
      next_step_at: new Date(now.getTime() + (nextStep.delay_hours || 0) * 3_600_000).toISOString(),
    }
    : {
      current_step: execution.current_step + 1,
      status: "completed",
      completed_at: now.toISOString(),
    };

  const { error } = await supabase.from("sequence_executions")
    .update(update)
    .eq("id", execution.id)
    .eq("status", "running")
    .eq("current_step", execution.current_step);
  if (error) throw error;
}

async function completeExecution(
  supabase: AdminClient,
  execution: ExecutionRow,
): Promise<void> {
  const { error } = await supabase.from("sequence_executions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", execution.id)
    .eq("status", "running")
    .eq("current_step", execution.current_step);
  if (error) throw error;
}

interface ExecutionRow {
  id: string;
  current_step: number;
}

interface StepRow {
  delay_hours?: number | null;
}

// O cliente e intencionalmente dinamico nesta Edge Function porque o schema
// gerado do frontend nao e importavel pelo runtime Deno.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, "public", "public", any, any>;
