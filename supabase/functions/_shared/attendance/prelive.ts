// Validador pré-live do agente de faltas. Lógica pura, sem I/O.
//
// Antes de virar `attendance_agent.mode = 'live'`, o agente passa a
// mandar WhatsApp pros TREINADORES de verdade (não mais só pro
// shadow_phone). Esse helper consolida os checks que precisam estar
// verdes pra esse switch ser seguro, e devolve um relatório
// GO / NO-GO / INDETERMINATE.
//
// - `blocker` = impede ir live.
// - `warning` = não impede, mas vale revisar.
// - `INDETERMINATE` = a coleta de estado falhou; não dá pra afirmar
//   GO nem NO-GO com confiança (precedência sobre tudo).

export type CheckSeverity = "blocker" | "warning";
export type CheckStatus = "pass" | "fail";

export interface PreLiveCheck {
  id: string;
  label: string;
  status: CheckStatus;
  severity: CheckSeverity;
  detail: string;
}

export interface PreLiveTrainer {
  id: string;
  full_name: string;
  phone: string | null;
}

export interface PreLiveSendWindow {
  start_hour: number;
  end_hour: number;
  days_of_week: number[];
}

export interface PreLiveInput {
  /** policy attendance_agent.mode atual */
  mode: string | null;
  shadowPhone: string | null;
  fallbackTrainerId: string | null;
  /** null = trainer não encontrado pelo id */
  fallbackTrainer: PreLiveTrainer | null;
  fallbackTrainerActive: boolean | null;
  cronSecretPresent: boolean;
  sendWindow: PreLiveSendWindow | null;
  healthcheckLastStatus: string | null;
  healthcheckLastOkAt: string | null;
  healthcheckConsecutiveFailures: number;
  /** trainers com is_active=true */
  activeTrainers: PreLiveTrainer[];
  expectedCrons: string[];
  presentCrons: string[];
  /** referência temporal (chamador passa new Date()) */
  now: Date;
  /**
   * true quando alguma query de coleta de estado falhou. Quando true,
   * o relatório vira INDETERMINATE — os checks abaixo podem estar
   * baseados em dados parciais/vazios e não devem virar um NO-GO
   * enganoso (que seria confundido com "estado ruim de verdade").
   */
  collectionFailed: boolean;
}

export interface PreLiveReport {
  decision: "GO" | "NO-GO" | "INDETERMINATE";
  checks: PreLiveCheck[];
  blockers: PreLiveCheck[];
  warnings: PreLiveCheck[];
}

/** Valida formato E.164 (+ seguido de 8-15 dígitos, primeiro 1-9). */
export function isE164(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

/**
 * Valida send_window: horas no range, start < end, dias 0-6 não-vazio
 * e SEM duplicatas (dia da semana repetido é sempre erro de config).
 */
export function isValidSendWindow(
  w: PreLiveSendWindow | null | undefined,
): boolean {
  if (!w) return false;
  if (!Number.isInteger(w.start_hour) || !Number.isInteger(w.end_hour)) {
    return false;
  }
  if (w.start_hour < 0 || w.start_hour > 23) return false;
  if (w.end_hour < 1 || w.end_hour > 24) return false;
  if (w.start_hour >= w.end_hour) return false;
  if (!Array.isArray(w.days_of_week) || w.days_of_week.length === 0) {
    return false;
  }
  if (new Set(w.days_of_week).size !== w.days_of_week.length) return false;
  return w.days_of_week.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

/**
 * Horas desde um timestamp ISO até `now`. Retorna `null` se o input
 * for vazio, não-parseável, OU não tiver indicador de timezone
 * explícito (`Z` ou `±HH:MM`) — sem timezone o `Date.parse` interpreta
 * como hora local, dando resultado ambíguo. Tratar `null` como
 * "não dá pra confiar na data".
 */
export function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) return null;
  const t = Date.parse(trimmed);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 3_600_000;
}

const HEALTHCHECK_STALE_HOURS = 48;

/**
 * Roda todos os checks pré-live e consolida o relatório.
 *
 * Decisão:
 *   - `INDETERMINATE` se `input.collectionFailed` (precedência total).
 *   - `NO-GO` se houver ≥1 blocker em falha.
 *   - `GO` caso contrário (warnings não impedem).
 */
export function evaluatePreLiveChecks(input: PreLiveInput): PreLiveReport {
  const checks: PreLiveCheck[] = [];

  const add = (
    id: string,
    label: string,
    ok: boolean,
    severity: CheckSeverity,
    detail: string,
  ) => {
    checks.push({
      id,
      label,
      status: ok ? "pass" : "fail",
      severity,
      detail,
    });
  };

  // 1) fallback_trainer_id setado — escalação depende dele
  add(
    "fallback_trainer_set",
    "fallback_trainer_id configurado",
    !!input.fallbackTrainerId,
    "blocker",
    input.fallbackTrainerId
      ? `id ${input.fallbackTrainerId}`
      : "policy attendance_agent.fallback_trainer_id vazia — escalação não funciona",
  );

  // 2) fallback trainer existe e está ativo
  add(
    "fallback_trainer_active",
    "fallback trainer existe e is_active",
    input.fallbackTrainer !== null && input.fallbackTrainerActive === true,
    "blocker",
    input.fallbackTrainer === null
      ? "trainer do fallback_trainer_id não encontrado"
      : input.fallbackTrainerActive
        ? `${input.fallbackTrainer.full_name} ativo`
        : `${input.fallbackTrainer.full_name} está inativo`,
  );

  // 3) fallback trainer tem phone E.164
  add(
    "fallback_trainer_phone",
    "fallback trainer tem telefone E.164",
    isE164(input.fallbackTrainer?.phone),
    "blocker",
    input.fallbackTrainer?.phone
      ? isE164(input.fallbackTrainer.phone)
        ? "phone OK"
        : `phone "${input.fallbackTrainer.phone}" não está em E.164`
      : "fallback trainer sem telefone",
  );

  // 4) cron_secret presente
  add(
    "cron_secret_present",
    "cron_secret configurado em runtime_config",
    input.cronSecretPresent,
    "blocker",
    input.cronSecretPresent
      ? "presente"
      : "ausente — crons não conseguem autenticar nas edge functions",
  );

  // 5) send_window válido
  add(
    "send_window_valid",
    "send_window é válido",
    isValidSendWindow(input.sendWindow),
    "blocker",
    isValidSendWindow(input.sendWindow)
      ? `${input.sendWindow!.start_hour}h-${input.sendWindow!.end_hour}h, ${input.sendWindow!.days_of_week.length} dia(s)`
      : "send_window ausente ou inválido (start>=end, dias vazios/duplicados, etc.)",
  );

  // 6) healthcheck não está em estado de falha
  const hcStatus = (input.healthcheckLastStatus ?? "").toLowerCase();
  add(
    "healthcheck_not_failed",
    "healthcheck do canal não está em falha",
    hcStatus !== "failed",
    "blocker",
    hcStatus === "failed"
      ? "última execução do healthcheck retornou 'failed'"
      : hcStatus === "ok"
        ? "último healthcheck OK"
        : `último healthcheck: ${hcStatus || "nunca rodou"}`,
  );

  // 7) healthcheck sem falhas consecutivas
  add(
    "healthcheck_no_consecutive_failures",
    "healthcheck sem falhas consecutivas",
    input.healthcheckConsecutiveFailures === 0,
    "blocker",
    input.healthcheckConsecutiveFailures === 0
      ? "contador zerado"
      : `${input.healthcheckConsecutiveFailures} falha(s) consecutiva(s)`,
  );

  // 8) healthcheck rodou recentemente com sucesso — BLOCKER.
  //    Pra ir live precisa de um `ok` confirmado nas últimas 48h.
  //    `hoursSince` null = nunca rodou OU timestamp inconfiável → falha.
  const hcHours = hoursSince(input.healthcheckLastOkAt, input.now);
  add(
    "healthcheck_recent",
    `healthcheck OK nas últimas ${HEALTHCHECK_STALE_HOURS}h`,
    hcHours !== null && hcHours <= HEALTHCHECK_STALE_HOURS,
    "blocker",
    hcHours === null
      ? "nenhum healthcheck OK confiável registrado (nunca rodou ou timestamp inválido)"
      : hcHours <= HEALTHCHECK_STALE_HOURS
        ? `último OK há ${hcHours.toFixed(1)}h`
        : `último OK há ${hcHours.toFixed(1)}h (stale, limite ${HEALTHCHECK_STALE_HOURS}h)`,
  );

  // 9) há pelo menos 1 trainer ativo — sem isso ninguém recebe alerta
  //    em live. (Precede o check de telefones: lista vazia "passaria"
  //    o check de telefones por vacuidade.)
  add(
    "has_active_trainers",
    "existe pelo menos 1 trainer ativo",
    input.activeTrainers.length >= 1,
    "blocker",
    input.activeTrainers.length >= 1
      ? `${input.activeTrainers.length} trainer(s) ativo(s)`
      : "nenhum trainer ativo — ninguém receberia alerta em live",
  );

  // 10) todos os trainers ativos têm phone E.164 (blocker — em live as
  //     mensagens vão pros treinadores)
  const trainersNoPhone = input.activeTrainers.filter(
    (t) => !isE164(t.phone),
  );
  add(
    "active_trainers_have_phone",
    "todos os trainers ativos têm telefone E.164",
    input.activeTrainers.length >= 1 && trainersNoPhone.length === 0,
    "blocker",
    input.activeTrainers.length === 0
      ? "sem trainers ativos pra verificar (ver has_active_trainers)"
      : trainersNoPhone.length === 0
        ? `${input.activeTrainers.length} trainer(s) ativo(s), todos com phone`
        : `${trainersNoPhone.length} sem phone E.164: ${trainersNoPhone
            .map((t) => t.full_name)
            .join(", ")}`,
  );

  // 11) todos os crons esperados presentes
  const missingCrons = input.expectedCrons.filter(
    (c) => !input.presentCrons.includes(c),
  );
  add(
    "crons_present",
    "todos os crons do agente estão agendados",
    missingCrons.length === 0,
    "blocker",
    missingCrons.length === 0
      ? `${input.expectedCrons.length} cron(s) presentes`
      : `faltando: ${missingCrons.join(", ")}`,
  );

  // 12) shadow_phone presente (warning — em live não é usado, mas é
  //     bom ter pra poder voltar pra shadow rapidamente)
  add(
    "shadow_phone_present",
    "shadow_phone configurado (fallback pra voltar a shadow)",
    isE164(input.shadowPhone),
    "warning",
    isE164(input.shadowPhone)
      ? "presente"
      : "vazio ou fora de E.164 — sem rede de segurança pra voltar pra shadow",
  );

  const blockers = checks.filter(
    (c) => c.severity === "blocker" && c.status === "fail",
  );
  const warnings = checks.filter(
    (c) => c.severity === "warning" && c.status === "fail",
  );

  let decision: PreLiveReport["decision"];
  if (input.collectionFailed) {
    decision = "INDETERMINATE";
  } else {
    decision = blockers.length === 0 ? "GO" : "NO-GO";
  }

  return { decision, checks, blockers, warnings };
}
