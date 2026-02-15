import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { conversation_id, message } = await req.json();
    if (!conversation_id || !message) {
      return new Response(JSON.stringify({ error: "conversation_id and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save user message
    await supabase.from("conversation_messages").insert({
      conversation_id,
      role: "user",
      content: message,
      ai_generated: false,
    });

    // Update conversation last_message_at
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation_id);

    // Get conversation with lead info
    const { data: conv } = await supabase
      .from("conversations")
      .select("*, leads:lead_id(name, phone, email, status, qualification_score, tags, temperature)")
      .eq("id", conversation_id)
      .single();

    // Get active agent config
    const { data: agent } = await supabase
      .from("ai_agent_config")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!agent) {
      return new Response(JSON.stringify({ error: "No active AI agent configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get conversation history (last 20 messages for context)
    const { data: history } = await supabase
      .from("conversation_messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(20);

    // Build lead context
    const lead = conv?.leads as Record<string, unknown> | null;
    const leadContext = lead
      ? `\n\nContexto do Lead:\n- Nome: ${lead.name}\n- Status: ${lead.status}\n- Score: ${lead.qualification_score}\n- Temperatura: ${lead.temperature || "não definida"}\n- Tags: ${(Array.isArray(lead.tags) ? lead.tags : []).join(", ") || "nenhuma"}\n- Telefone: ${lead.phone || "não informado"}\n- Email: ${lead.email || "não informado"}`
      : "";

    // Build knowledge base context
    const kb = (agent.knowledge_base as Record<string, unknown>) || {};
    let kbContext = "";
    if (Object.keys(kb).length > 0) {
      kbContext = "\n\nBase de Conhecimento do Studio:";
      if (kb.studio_name) kbContext += `\n- Nome: ${kb.studio_name}`;
      if (kb.coordinator) kbContext += `\n- Coordenador: ${kb.coordinator}`;
      if (kb.modalities) kbContext += `\n- Modalidades: ${kb.modalities}`;
      if (kb.session_duration) kbContext += `\n- Duração da sessão: ${kb.session_duration}`;
      if (kb.age_range) kbContext += `\n- Faixa etária: ${kb.age_range}`;
      if (kb.schedule) kbContext += `\n- Horários: ${kb.schedule}`;
      if (kb.address) kbContext += `\n- Endereço: ${kb.address}`;
      if (kb.additional_info) kbContext += `\n- Info adicional: ${kb.additional_info}`;
    }

    const systemPrompt = (agent.system_prompt || "Você é um assistente de atendimento de um studio de treinamento funcional. Seja cordial e objetivo.") + leadContext + kbContext;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []).map((m: { role: string; content: string }) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    ];

    // Call Lovable AI Gateway
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: agent.model || "google/gemini-3-flash-preview",
        messages,
        temperature: agent.temperature || 0.7,
        max_tokens: agent.max_tokens || 2000,
        stream: false,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";
    // Replace {lead_id} placeholder with actual lead ID
    const assistantContent = conv?.lead_id ? rawContent.replace(/\{lead_id\}/g, conv.lead_id) : rawContent;
    const usage = aiData.usage || {};

    // Save assistant message
    await supabase.from("conversation_messages").insert({
      conversation_id,
      role: "assistant",
      content: assistantContent,
      ai_generated: true,
    });

    // Log usage
    await supabase.from("ai_conversation_logs").insert({
      conversation_id,
      model: agent.model || "google/gemini-3-flash-preview",
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
      cost_cents: 0,
    });

    // Update conversation last_message_at
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation_id);

    // Check handoff rules
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

    return new Response(JSON.stringify({ 
      response: assistantContent,
      needs_handoff: needsHandoff,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-conversation-message error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
