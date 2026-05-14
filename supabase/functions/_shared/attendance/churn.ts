// Detector de churn / evasão. Lógica pura, sem I/O. Determinístico e
// testável.
//
// O detector de FALTAS (`detection.ts`) pega o sinal AGUDO: 2 faltas
// seguidas, 1 no personal. O churn detector pega o sinal CRÔNICO: o
// aluno que vai rareando — de 3x/semana pra 1x, de 1x pra zero — sem
// nunca "faltar 2 seguidas" de um jeito que dispare o outro agente.
//
// Método: compara a média semanal de PRESENÇAS recente de cada aluno
// com a média semanal BASELINE (histórico mais antigo). Queda
// sustentada acima de um threshold = risco de churn.
//
// Cuidados embutidos:
//  - Só semanas com cobertura COMPLETA pelos dados contam. Semana
//    parcial na borda do range de dados enviesa a média pra baixo e
//    geraria falso churn.
//  - Baseline ADAPTATIVO: usa o que tiver. Abaixo de `minBaselineWeeks`
//    o resultado é `provisional` e exige uma queda maior pra disparar
//    (anti falso-positivo enquanto o histórico é curto).
//  - Aluno sem baseline (novato) nunca dispara — `insufficient`.
//  - Só `status = present` conta como presença. `no_show` e
//    `cancelled_late` são o oposto do que medimos aqui.

export interface ChurnEvent {
  /** Data do evento, ISO yyyy-mm-dd. */
  occurredDate: string;
  /** true só pra eventos que contam como presença efetiva (status present). */
  isPresence: boolean;
}

export interface ChurnEvaluationOptions {
  /** Primeira data com cobertura real de dados (ISO yyyy-mm-dd). */
  dataStart: string;
  /** Última data com cobertura real de dados (ISO yyyy-mm-dd). */
  dataEnd: string;
  /** Quantas semanas completas mais recentes formam a janela "recente". */
  recentWeeks: number;
  /** Quantas semanas completas (antes da recente) formam a baseline (alvo). */
  baselineWeeks: number;
  /** Abaixo desse nº de semanas de baseline, o resultado é `provisional`. */
  minBaselineWeeks: number;
  /** Queda mínima (0-1) pra disparar quando `confidence = full`. */
  dropThresholdPct: number;
  /** Queda mínima (0-1) pra disparar quando `confidence = provisional`. */
  provisionalDropThresholdPct: number;
}

export type ChurnConfidence = "full" | "provisional" | "insufficient";

export interface ChurnRiskResult {
  studentId: string;
  /** true = aluno em risco de evasão. */
  churnRisk: boolean;
  /**
   * - `full`        → baseline >= minBaselineWeeks, threshold normal.
   * - `provisional` → baseline curto, threshold mais conservador.
   * - `insufficient`→ não há dados pra avaliar (sem baseline / histórico
   *   curto demais / sem presenças no baseline). `churnRisk` sempre false.
   */
  confidence: ChurnConfidence;
  recentWeeklyAvg: number;
  baselineWeeklyAvg: number;
  /** (baseline - recent) / baseline. null quando não dá pra computar. */
  dropPct: number | null;
  recentWeeksUsed: number;
  baselineWeeksUsed: number;
  /** Threshold efetivamente aplicado pra decidir `churnRisk`. null se insufficient. */
  thresholdApplied: number | null;
  detail: string;
}

// ─────────── Aritmética de datas (UTC, sem armadilha de fuso) ───────────

function parseUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function fmtUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = parseUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtUtc(d);
}

/** Segunda-feira da semana que contém `iso` (semana ISO: segunda→domingo). */
export function mondayOf(iso: string): string {
  const d = parseUtc(iso);
  const day = d.getUTCDay(); // 0=domingo … 6=sábado
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return fmtUtc(d);
}

/**
 * Lista as segundas-feiras de TODAS as semanas com cobertura completa
 * dentro de [dataStart, dataEnd]. Uma semana só conta se a segunda E o
 * domingo dela caem dentro do range — semana truncada na borda fica de
 * fora. Retorno em ordem cronológica crescente.
 */
export function completeWeeks(dataStart: string, dataEnd: string): string[] {
  if (dataEnd < dataStart) return [];
  let monday = mondayOf(dataStart);
  // Se a segunda da primeira semana cai antes do range, essa semana é
  // parcial — pula pra próxima.
  if (monday < dataStart) monday = addDays(monday, 7);

  const weeks: string[] = [];
  // Trava de segurança: no máximo ~10 anos de semanas, evita loop infinito
  // se algum input vier corrompido.
  for (let guard = 0; guard < 520; guard++) {
    const sunday = addDays(monday, 6);
    if (sunday > dataEnd) break;
    weeks.push(monday);
    monday = addDays(monday, 7);
  }
  return weeks;
}

// ─────────── Avaliação ───────────

function insufficient(
  studentId: string,
  detail: string,
  partial: Partial<ChurnRiskResult> = {},
): ChurnRiskResult {
  return {
    studentId,
    churnRisk: false,
    confidence: "insufficient",
    recentWeeklyAvg: 0,
    baselineWeeklyAvg: 0,
    dropPct: null,
    recentWeeksUsed: 0,
    baselineWeeksUsed: 0,
    thresholdApplied: null,
    detail,
    ...partial,
  };
}

/**
 * Avalia o risco de churn de UM aluno.
 *
 * Decisão:
 *   - `insufficient` se não há semanas completas suficientes pra formar
 *     recente + baseline, ou se o aluno não tem nenhuma presença na
 *     baseline (não dá pra medir queda a partir de zero).
 *   - caso contrário compara média recente vs baseline; dispara
 *     `churnRisk` se a queda >= threshold (normal ou provisional).
 */
export function evaluateChurnRisk(
  studentId: string,
  events: ChurnEvent[],
  opts: ChurnEvaluationOptions,
): ChurnRiskResult {
  // Guarda de configuração — helper puro não confia em input externo.
  if (
    !Number.isInteger(opts.recentWeeks) ||
    opts.recentWeeks < 1 ||
    !Number.isInteger(opts.baselineWeeks) ||
    opts.baselineWeeks < 1 ||
    !Number.isInteger(opts.minBaselineWeeks) ||
    opts.minBaselineWeeks < 1
  ) {
    return insufficient(studentId, "configuração de janelas inválida");
  }

  const weeks = completeWeeks(opts.dataStart, opts.dataEnd);

  // Precisa de pelo menos `recentWeeks` semanas + 1 de baseline.
  if (weeks.length < opts.recentWeeks + 1) {
    return insufficient(
      studentId,
      `histórico insuficiente: ${weeks.length} semana(s) completa(s), ` +
        `precisa de ${opts.recentWeeks + 1}+`,
    );
  }

  // Presenças por semana (só semanas completas; eventos fora caem fora).
  const presenceByWeek = new Map<string, number>();
  for (const w of weeks) presenceByWeek.set(w, 0);
  for (const ev of events) {
    if (!ev.isPresence) continue;
    const wk = mondayOf(ev.occurredDate);
    const cur = presenceByWeek.get(wk);
    if (cur !== undefined) presenceByWeek.set(wk, cur + 1);
  }

  // `weeks` está em ordem crescente: recente = últimas N, baseline = as
  // anteriores (limitada a `baselineWeeks`, da mais nova pra trás).
  const recentWeekKeys = weeks.slice(-opts.recentWeeks);
  const beforeRecent = weeks.slice(0, weeks.length - opts.recentWeeks);
  const baselineWeekKeys = beforeRecent.slice(-opts.baselineWeeks);

  const recentWeeksUsed = recentWeekKeys.length;
  const baselineWeeksUsed = baselineWeekKeys.length;

  if (baselineWeeksUsed === 0) {
    return insufficient(studentId, "sem semanas de baseline", {
      recentWeeksUsed,
    });
  }

  const recentTotal = recentWeekKeys.reduce(
    (sum, w) => sum + (presenceByWeek.get(w) ?? 0),
    0,
  );
  const baselineTotal = baselineWeekKeys.reduce(
    (sum, w) => sum + (presenceByWeek.get(w) ?? 0),
    0,
  );
  const recentWeeklyAvg = recentTotal / recentWeeksUsed;
  const baselineWeeklyAvg = baselineTotal / baselineWeeksUsed;

  // Aluno sem nenhuma presença na baseline: não dá pra medir "queda" a
  // partir de zero. Pode ser novato ou alguém que nunca engajou — não é
  // churn no sentido que esse detector mede.
  if (baselineWeeklyAvg === 0) {
    return insufficient(
      studentId,
      "sem presenças na baseline — nada a comparar",
      { recentWeeklyAvg, baselineWeeklyAvg, recentWeeksUsed, baselineWeeksUsed },
    );
  }

  const dropPct = (baselineWeeklyAvg - recentWeeklyAvg) / baselineWeeklyAvg;

  const confidence: ChurnConfidence =
    baselineWeeksUsed >= opts.minBaselineWeeks ? "full" : "provisional";
  const thresholdApplied =
    confidence === "full"
      ? opts.dropThresholdPct
      : opts.provisionalDropThresholdPct;

  const churnRisk = dropPct >= thresholdApplied;

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const detail = churnRisk
    ? `queda de ${pct(dropPct)} (${baselineWeeklyAvg.toFixed(1)}→` +
      `${recentWeeklyAvg.toFixed(1)}/sem), threshold ${pct(thresholdApplied)}` +
      (confidence === "provisional" ? " — provisional" : "")
    : `sem risco: queda de ${pct(dropPct)} abaixo do threshold ` +
      `${pct(thresholdApplied)}`;

  return {
    studentId,
    churnRisk,
    confidence,
    recentWeeklyAvg,
    baselineWeeklyAvg,
    dropPct,
    recentWeeksUsed,
    baselineWeeksUsed,
    thresholdApplied,
    detail,
  };
}

/**
 * Roda `evaluateChurnRisk` em lote. Retorna TODOS os resultados (inclusive
 * `insufficient` e os sem risco) — o chamador filtra `churnRisk === true`
 * pra criar alertas, e usa o resto pro summary de observabilidade.
 */
export function evaluateAllChurn(
  byStudent: Map<string, ChurnEvent[]>,
  opts: ChurnEvaluationOptions,
): ChurnRiskResult[] {
  const results: ChurnRiskResult[] = [];
  for (const [studentId, events] of byStudent) {
    results.push(evaluateChurnRisk(studentId, events, opts));
  }
  return results;
}
