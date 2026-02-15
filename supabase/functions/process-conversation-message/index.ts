import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple cost estimation per 1M tokens (in cents)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "google/gemini-3-flash-preview": { input: 10, output: 40 },
  "google/gemini-2.5-flash": { input: 15, output: 60 },
  "google/gemini-2.5-pro": { input: 125, output: 500 },
};

function estimateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || { input: 10, output: 40 };
  return Math.round((inputTokens * costs.input + outputTokens * costs.output) / 1_000_000);
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // --- 1. Authenticate user ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- 2. Validate input ---
    const { conversation_id, message } = await req.json();
    if (!conversation_id || !message) {
      return jsonResponse({ error: "conversation_id and message are required" }, 400);
    }

    // --- 3. Get conversation with lead info ---
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("*, leads:lead_id(name, phone, email, status, qualification_score, tags, temperature)")
      .eq("id", conversation_id)
      .single();

    if (convError || !conv) {
      return jsonResponse({ error: "Conversa não encontrada" }, 404);
    }

    // --- 4. Save user message ---
    const { error: insertMsgError } = await supabase.from("conversation_messages").insert({
      conversation_id,
      role: "user",
      content: message,
      ai_generated: false,
    });

    if (insertMsgError) {
      console.error("Failed to save user message:", insertMsgError);
      return jsonResponse({ error: "Falha ao salvar mensagem" }, 500);
    }

    // Update conversation timestamp (single update, not duplicated)
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation_id);

    // --- 5. Check if AI should respond ---
    // If conversation is under human control, just save the message and return
    if (conv.status === "human_control") {
      return jsonResponse({
        response: null,
        needs_handoff: false,
        human_control: true,
        message: "Conversa sob controle humano. Mensagem salva sem resposta da IA.",
      });
    }

    // --- 6. Get active agent config ---
    const { data: agent } = await supabase
      .from("ai_agent_config")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!agent) {
      return jsonResponse({ error: "Nenhum agente IA ativo configurado" }, 400);
    }

    // Check behavior_config: if auto_respond is explicitly false, don't respond
    const behaviorConfig = (agent.behavior_config as Record<string, unknown>) || {};
    if (behaviorConfig.auto_respond === false) {
      return jsonResponse({
        response: null,
        needs_handoff: false,
        auto_respond_disabled: true,
        message: "Auto-resposta desativada nas configurações do agente.",
      });
    }

    // --- 7. Get conversation history (last 20 messages for context) ---
    const { data: history } = await supabase
      .from("conversation_messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(20);

    // --- 8. Build system prompt with lead context + knowledge base ---
    const lead = conv.leads as Record<string, unknown> | null;
    let leadContext = "";
    if (lead) {
      leadContext = `\n\nContexto do Lead:\n- Nome: ${lead.name}\n- Status: ${lead.status}\n- Score: ${lead.qualification_score}\n- Temperatura: ${lead.temperature || "não definida"}\n- Tags: ${(Array.isArray(lead.tags) ? lead.tags : []).join(", ") || "nenhuma"}\n- Telefone: ${lead.phone || "não informado"}\n- Email: ${lead.email || "não informado"}`;
    }

    const kb = (agent.knowledge_base as Record<string, unknown>) || {};
    let kbContext = "";
    if (Object.keys(kb).length > 0) {
      kbContext = "\n\nBase de Conhecimento do Studio:";
      const fields: Array<[string, string]> = [
        ["studio_name", "Nome"], ["coordinator", "Coordenador"], ["modalities", "Modalidades"],
        ["session_duration", "Duração da sessão"], ["age_range", "Faixa etária"],
        ["schedule", "Horários"], ["address", "Endereço"], ["additional_info", "Info adicional"],
      ];
      for (const [key, label] of fields) {
        if (kb[key]) kbContext += `\n- ${label}: ${kb[key]}`;
      }
    }

    const systemPrompt = (agent.system_prompt || "Você é um assistente de atendimento de um studio de treinamento funcional. Seja cordial e objetivo.") + leadContext + kbContext;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []).map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    ];

    // --- 9. Call Lovable AI Gateway ---
    const modelName = agent.model || "google/gemini-3-flash-preview";
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature: agent.temperature || 0.7,
        max_tokens: agent.max_tokens || 2000,
        stream: false,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return jsonResponse({ error: "Rate limit exceeded. Please try again later." }, 429);
      }
      if (aiResponse.status === 402) {
        return jsonResponse({ error: "Payment required. Please add funds." }, 402);
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";
    // Replace {lead_id} placeholder with actual lead ID for anamnesis link
    const assistantContent = conv.lead_id ? rawContent.replace(/\{lead_id\}/g, conv.lead_id) : rawContent;
    const usage = aiData.usage || {};

    // --- 10. Save assistant message ---
    const { error: saveAssistantError } = await supabase.from("conversation_messages").insert({
      conversation_id,
      role: "assistant",
      content: assistantContent,
      ai_generated: true,
    });

    if (saveAssistantError) {
      console.error("Failed to save assistant message:", saveAssistantError);
    }

    // --- 11. Log usage with estimated cost ---
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const costCents = estimateCostCents(modelName, inputTokens, outputTokens);

    const { error: logError } = await supabase.from("ai_conversation_logs").insert({
      conversation_id,
      model: modelName,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_cents: costCents,
    });

    if (logError) {
      console.error("Failed to log AI usage:", logError);
    }

    // --- 12. Check handoff rules ---
    const handoffRules = (agent.handoff_rules as Array<{ enabled?: boolean; keywords?: string }>) || [];
    let needsHandoff = false;
    const lowerContent = message.toLowerCase();

    for (const rule of handoffRules) {
      if (rule.enabled && rule.keywords) {
        const keywords = rule.keywords.split(",").map((k: string) => k.trim().toLowerCase());
        if (keywords.some((kw: string) => lowerContent.includes(kw))) {
          needsHandoff = true;
          break;
        }
      }
    }

    if (needsHandoff) {
      await supabase.from("conversations").update({ status: "needs_handoff" }).eq("id", conversation_id);
    }

    return jsonResponse({
      response: assistantContent,
      needs_handoff: needsHandoff,
    });
  } catch (e) {
    console.error("process-conversation-message error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
