// Endpoint público acessado pelo link no WhatsApp.
// Marca o alerta como acknowledged e cria task de follow-up pro treinador.
// Não requer JWT — autenticação é via ack_token aleatório (24 bytes hex).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token =
      url.searchParams.get("token") ??
      (req.method === "POST"
        ? ((await req.json().catch(() => ({}))) as { token?: string }).token
        : null);

    if (!token || typeof token !== "string" || token.length < 24) {
      return htmlError("Link inválido ou expirado.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: alert, error } = await supabase
      .from("attendance_alerts")
      .select(
        "id, status, student_id, trainer_id, escalated_to_trainer_id, acknowledged_at, student:students(full_name)",
      )
      .eq("ack_token", token)
      .maybeSingle();

    if (error) throw new Error(`lookup: ${error.message}`);
    if (!alert) {
      return htmlError("Link inválido ou já expirado.");
    }

    const studentName =
      (alert as { student?: { full_name?: string } }).student?.full_name ??
      "aluno";

    if (alert.status === "acknowledged" || alert.status === "resolved") {
      return htmlOk(
        `Já marcado como tratado em ${formatTs(alert.acknowledged_at)}.`,
        studentName,
      );
    }

    const nowIso = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("attendance_alerts")
      .update({
        status: "acknowledged",
        acknowledged_at: nowIso,
        acknowledged_via: "whatsapp_link",
      })
      .eq("id", alert.id);
    if (updateErr) throw new Error(`update: ${updateErr.message}`);

    // Cria task de follow-up pro treinador (se houver profile mapeado)
    const followUpTrainerId =
      alert.escalated_to_trainer_id ?? alert.trainer_id ?? null;
    if (followUpTrainerId) {
      const { data: trainer } = await supabase
        .from("trainers")
        .select("profile_id")
        .eq("id", followUpTrainerId)
        .maybeSingle();
      if (trainer?.profile_id) {
        await supabase.from("tasks").insert({
          tipo: "whatsapp",
          student_id: alert.student_id,
          assignee_id: trainer.profile_id,
          titulo: `Reativação — falar com ${studentName}`,
          descricao:
            "Aluno em risco de evasão (alerta automatizado). Tom: cuidado, não cobrança.",
          prioridade: "alta",
          status: "pendente",
        });
      }
    }

    return htmlOk("Marcado como tratado. Boa conversa.", studentName);
  } catch (err) {
    console.error("acknowledge-attendance-alert:", err);
    return htmlError("Erro inesperado. Tenta de novo em alguns minutos.");
  }
});

function htmlOk(message: string, studentName: string): Response {
  return htmlPage(
    `<h1>✓ ${escapeHtml(studentName)}</h1><p>${escapeHtml(message)}</p>`,
    200,
  );
}

function htmlError(message: string): Response {
  return htmlPage(`<h1>Ops</h1><p>${escapeHtml(message)}</p>`, 200);
}

function htmlPage(body: string, status: number): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Fabrik · Alerta de presença</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 480px;
           margin: 0 auto; padding: 48px 24px; color: #111; line-height: 1.5; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    p { font-size: 16px; color: #555; }
  </style>
</head>
<body>${body}</body>
</html>`;
  return new Response(html, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
