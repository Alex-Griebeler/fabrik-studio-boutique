import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_students",
  title: "Buscar alunos",
  description: "Busca alunos do studio por nome, com status e contato. Use para localizar um aluno antes de outras consultas.",
  inputSchema: {
    query: z.string().trim().optional().describe("Parte do nome do aluno. Vazio retorna os mais recentes."),
    only_active: z.boolean().optional().describe("Se verdadeiro, retorna apenas alunos ativos."),
    limit: z.number().int().min(1).max(50).optional().describe("Máximo de resultados (padrão 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, only_active, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("students")
      .select("id, full_name, status, is_active, phone, email, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (query) q = q.ilike("full_name", `%${query}%`);
    if (only_active) q = q.eq("is_active", true);

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { students: data ?? [] },
    };
  },
});
