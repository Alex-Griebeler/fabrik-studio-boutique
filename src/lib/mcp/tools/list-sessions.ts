import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD");

export default defineTool({
  name: "list_sessions",
  title: "Listar sessões da agenda",
  description: "Lista as sessões da agenda do studio em um intervalo de datas, com modalidade, horário e status.",
  inputSchema: {
    date_start: isoDate.describe("Data inicial (AAAA-MM-DD)."),
    date_end: isoDate.describe("Data final (AAAA-MM-DD)."),
    modality: z.string().trim().optional().describe("Filtrar por modalidade (ex: BTB, HIIT, Pilates)."),
    limit: z.number().int().min(1).max(200).optional().describe("Máximo de sessões (padrão 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date_start, date_end, modality, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("sessions")
      .select("id, session_date, start_time, end_time, modality, status, capacity, trainer_id, session_type")
      .gte("session_date", date_start)
      .lte("session_date", date_end)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(limit ?? 100);
    if (modality) q = q.eq("modality", modality);

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { sessions: data ?? [] },
    };
  },
});
