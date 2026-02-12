import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find executions ready to run
    const { data: readyExecutions, error: execError } = await supabase
      .from("sequence_executions")
      .select("*, nurturing_sequences:sequence_id(name), leads:lead_id(name, phone, email)")
      .eq("status", "running")
      .lte("next_step_at", new Date().toISOString());

    if (execError) throw execError;

    const results = [];

    for (const execution of (readyExecutions || [])) {
      try {
        // Get the current step
        const { data: step } = await supabase
          .from("sequence_steps")
          .select("*")
          .eq("sequence_id", execution.sequence_id)
          .eq("step_number", execution.current_step + 1)
          .single();

        if (!step) {
          // No more steps, mark as completed
          await supabase.from("sequence_executions")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", execution.id);
          results.push({ execution_id: execution.id, status: "completed" });
          continue;
        }

        // Substitute variables in message
        const lead = execution.leads as any;
        let messageContent = step.message_content || "";
        messageContent = messageContent
          .replace(/\{\{lead\.name\}\}/g, lead?.name || "")
          .replace(/\{\{lead\.phone\}\}/g, lead?.phone || "")
          .replace(/\{\{lead\.email\}\}/g, lead?.email || "");

        // Send via channel
        if (step.channel === "whatsapp" && lead?.phone) {
          try {
            await supabase.functions.invoke("send-whatsapp", {
              body: { to: lead.phone, message: messageContent },
            });
          } catch (e) {
            console.error("WhatsApp send failed:", e);
          }
        }

        // Record event
        await supabase.from("sequence_step_events").insert({
          execution_id: execution.id,
          step_id: step.id,
          event_type: "sent",
        });

        // Check if there are more steps
        const { data: nextStep } = await supabase
          .from("sequence_steps")
          .select("delay_hours")
          .eq("sequence_id", execution.sequence_id)
          .eq("step_number", execution.current_step + 2)
          .single();

        if (nextStep) {
          const nextAt = new Date();
          nextAt.setHours(nextAt.getHours() + (nextStep.delay_hours || 0));
          await supabase.from("sequence_executions")
            .update({ current_step: execution.current_step + 1, next_step_at: nextAt.toISOString() })
            .eq("id", execution.id);
        } else {
          await supabase.from("sequence_executions")
            .update({ current_step: execution.current_step + 1, status: "completed", completed_at: new Date().toISOString() })
            .eq("id", execution.id);
        }

        results.push({ execution_id: execution.id, step: execution.current_step + 1, status: "sent" });
      } catch (stepError) {
        console.error("Step execution error:", stepError);
        results.push({ execution_id: execution.id, status: "error", error: String(stepError) });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("execute-nurturing-step error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
