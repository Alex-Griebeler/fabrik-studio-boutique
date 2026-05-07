// Templates de mensagem do agente. Tom Fabrik:
// direto, brasileiro, sem urgência fabricada.
// Aluno NUNCA recebe — só treinador / Raquel.

import type { AlertType } from "./detection";

export interface AlertMessageContext {
  studentName: string;
  planLabel: string;          // ex: "Grupo 3x/semana" ou "Personal Training"
  lastAttendedAt: string | null;  // ISO yyyy-mm-dd
  missedDates: string[];      // ISO yyyy-mm-dd (oldest → newest)
  ackUrl: string;
  alertType: AlertType;
}

export interface EscalationMessageContext extends AlertMessageContext {
  trainerName: string;        // treinador que não fechou loop
  hoursOpen: number;
}

function fmtDate(iso: string): string {
  // yyyy-mm-dd → dd/MM
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function joinDates(dates: string[]): string {
  if (dates.length === 0) return "—";
  if (dates.length === 1) return fmtDate(dates[0]);
  if (dates.length === 2) return `${fmtDate(dates[0])} e ${fmtDate(dates[1])}`;
  const head = dates.slice(0, -1).map(fmtDate).join(", ");
  return `${head} e ${fmtDate(dates[dates.length - 1])}`;
}

export function buildTrainerAlertMessage(ctx: AlertMessageContext): string {
  const header =
    ctx.alertType === "pt_1_miss"
      ? "🟡 Aluno PT faltou"
      : `🟡 Aluno em risco — ${ctx.missedDates.length}ª falta seguida`;

  const lastSeen = ctx.lastAttendedAt
    ? `Última presença: ${fmtDate(ctx.lastAttendedAt)}`
    : "Sem presença recente registrada";

  const missedLabel = ctx.alertType === "pt_1_miss" ? "Faltou" : "Faltou";

  return [
    header,
    "",
    ctx.studentName,
    `Plano: ${ctx.planLabel}`,
    lastSeen,
    `${missedLabel}: ${joinDates(ctx.missedDates)}`,
    "",
    "Sugestão: contato hoje até 18h.",
    "Marca aqui quando falar:",
    ctx.ackUrl,
  ].join("\n");
}

export function buildEscalationMessage(ctx: EscalationMessageContext): string {
  const header = "🔴 Escalação — treinador não retornou";
  const lastSeen = ctx.lastAttendedAt
    ? `Última presença: ${fmtDate(ctx.lastAttendedAt)}`
    : "Sem presença recente registrada";

  return [
    header,
    "",
    `${ctx.studentName} (${ctx.planLabel})`,
    lastSeen,
    `Faltou: ${joinDates(ctx.missedDates)}`,
    "",
    `Treinador ${ctx.trainerName} não confirmou contato em ${ctx.hoursOpen}h.`,
    "Pode cobrir o contato com o aluno?",
    "",
    "Marca aqui quando falar:",
    ctx.ackUrl,
  ].join("\n");
}
