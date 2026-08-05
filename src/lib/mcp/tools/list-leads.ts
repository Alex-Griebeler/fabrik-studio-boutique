import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_leads",
  title: "Listar leads do CRM",
  description: "Lista leads do funil comercial com status, score de qualificação, origem e data do trial.",
  inputSchema: {
    status: z.string().trim().optional().describe("Filtrar por status do funil (ex: novo, contatado, trial_agendado)."),
    min_score: z.number().int().min(0).max(100).optional().describe("Score mínimo de qualificação."),
    limit: z.number().int().min(1).max(100).optional().describe("Máximo de leads (padrão 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, min_score, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("leads")
      .select("id, name, status, temperature, qualification_score, source, phone, trial_date, trial_time, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (status) q = q.eq("status", status);
    if (typeof min_score === "number") q = q.gte("qualification_score", min_score);

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { leads: data ?? [] },
    };
  },
});
