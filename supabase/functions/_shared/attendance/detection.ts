// Lógica pura de detecção de risco de evasão.
// Sem I/O. Tudo aqui é determinístico e testável.

export type AttendanceEventStatus =
  | "present"           // aluno foi (check-in registrado)
  | "no_show"           // aluno não foi e não cancelou
  | "cancelled_late"    // cancelou com menos de 12h — conta como falta
  | "cancelled_on_time" // cancelou com 12h+ — NÃO conta
  | "scheduled";        // futura/pendente — ignorar pra detecção

export type SessionType = "personal" | "group";

export interface AttendanceEvent {
  studentId: string;
  /**
   * Identificador UUID do evento, gravado no `missed_session_ids` (uuid[])
   * de `attendance_alerts`. Quando carregado de `attendance_events`,
   * vem do `attendance_events.id`. NÃO confundir com `source_id` (texto
   * tipo `"{idActivitySession}:{idMember}"` em eventos EVO) — esse é
   * só identificador externo, não pode entrar em coluna uuid.
   */
  sessionId: string;
  bookingId: string | null;   // legado (uuid de class_bookings); pode ser null
  sessionType: SessionType;
  modality: string;
  date: string;               // ISO yyyy-mm-dd
  startTime: string;          // HH:mm
  status: AttendanceEventStatus;
  trainerId: string | null;
  assistantTrainerId: string | null;
}

export type AlertType = "group_2_misses" | "pt_1_miss";

export interface RiskAlert {
  studentId: string;
  alertType: AlertType;
  missedSessionIds: string[];
  missedBookingIds: string[];
  missedDates: string[];      // ISO yyyy-mm-dd, oldest → newest, 1 entrada por DIA
  lastAttendedAt: string | null;
  primaryTrainerId: string | null;   // do treinador da sessão mais recente
}

const MISS_STATUSES: ReadonlySet<AttendanceEventStatus> = new Set([
  "no_show",
  "cancelled_late",
]);

const COUNTABLE_STATUSES: ReadonlySet<AttendanceEventStatus> = new Set([
  "present",
  "no_show",
  "cancelled_late",
]);

/**
 * Ordena eventos por data + horário ascendente.
 */
function sortChronological(events: AttendanceEvent[]): AttendanceEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0;
  });
}

/**
 * Bucket consolidado de eventos do mesmo dia. A regra do P3 da Fabrik
 * trata "1 dia" como unidade (e não "1 aula") — duas faltas no mesmo
 * dia não somam, é o mesmo dia ruim.
 */
export interface DayBucket {
  date: string;
  /** Hora do primeiro evento relevante (pra ordenação determinística). */
  startTime: string;
  status: "present" | "no_show" | "cancelled_late";
  /** Eventos do dia que casam com `status` do bucket — preservados pra alimentar `missedSessionIds`. */
  events: AttendanceEvent[];
}

/**
 * Colapsa lista de eventos `countable` em 1 bucket por dia. Prioridade:
 *
 *   present  >  no_show  >  cancelled_late
 *
 * Ou seja: se o aluno teve QUALQUER presença confirmada no dia, o dia
 * inteiro conta como presença (não importa se também faltou em outra
 * aula no mesmo dia — improvável, mas defensivo). Caso contrário, se
 * houve no_show, o dia é "falta". Caso só haja cancelled_late, o dia
 * é "falta tardia".
 *
 * Eventos `cancelled_on_time` e `scheduled` já devem ter sido filtrados
 * antes (não entram em `COUNTABLE_STATUSES`).
 */
export function collapseByDay(
  countableEvents: AttendanceEvent[],
): DayBucket[] {
  const byDate = new Map<string, AttendanceEvent[]>();
  for (const ev of countableEvents) {
    const list = byDate.get(ev.date);
    if (list) list.push(ev);
    else byDate.set(ev.date, [ev]);
  }

  const buckets: DayBucket[] = [];
  for (const [date, dayEvents] of byDate) {
    const sortedDay = [...dayEvents].sort((a, b) =>
      a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0,
    );

    // Prioridade: present > no_show > cancelled_late
    const presents = sortedDay.filter((e) => e.status === "present");
    if (presents.length > 0) {
      buckets.push({
        date,
        startTime: presents[0].startTime,
        status: "present",
        events: presents,
      });
      continue;
    }

    const noShows = sortedDay.filter((e) => e.status === "no_show");
    if (noShows.length > 0) {
      buckets.push({
        date,
        startTime: noShows[0].startTime,
        status: "no_show",
        events: noShows,
      });
      continue;
    }

    const cancelledLate = sortedDay.filter(
      (e) => e.status === "cancelled_late",
    );
    if (cancelledLate.length > 0) {
      buckets.push({
        date,
        startTime: cancelledLate[0].startTime,
        status: "cancelled_late",
        events: cancelledLate,
      });
    }
  }

  return buckets.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Decide o alerta pra UM aluno baseado no histórico recente de eventos.
 * Retorna null se o aluno não está em risco.
 *
 * Regra crítica: "2 faltas seguidas" significa **2 dias distintos** —
 * 2 events no mesmo dia colapsam em 1 dia-falta via `collapseByDay`.
 */
export function evaluateStudent(events: AttendanceEvent[]): RiskAlert | null {
  if (events.length === 0) return null;
  const studentId = events[0].studentId;

  const sorted = sortChronological(events);

  // 1) Filtra pra eventos que CONTAM (present / no_show / cancelled_late)
  const countable = sorted.filter((e) => COUNTABLE_STATUSES.has(e.status));
  if (countable.length === 0) return null;

  // 2) Colapsa em buckets por dia (1 bucket por data)
  const buckets = collapseByDay(countable);
  if (buckets.length === 0) return null;

  // 3) Última presença pro contexto da mensagem (último bucket present)
  const lastPresentBucket = [...buckets]
    .reverse()
    .find((b) => b.status === "present");
  const lastAttendedAt = lastPresentBucket?.date ?? null;

  // 4) Streak final de dias-falta (no_show ou cancelled_late), do mais
  //    recente pro mais antigo, parando na primeira presença.
  const trailingMissBuckets: DayBucket[] = [];
  for (let i = buckets.length - 1; i >= 0; i--) {
    const b = buckets[i];
    if (b.status === "present") break;
    trailingMissBuckets.unshift(b);
  }
  if (trailingMissBuckets.length === 0) return null;

  // 5) Flat de todos os events dos dias-falta (pra preencher missedSessionIds)
  const allTrailingEvents = trailingMissBuckets.flatMap((b) => b.events);

  // 6) Decisão de tipo de alerta.
  //    Se QUALQUER event na streak é personal → PT (1 dia-falta basta).
  const hasPersonalMiss = allTrailingEvents.some(
    (e) => e.sessionType === "personal" && MISS_STATUSES.has(e.status),
  );

  let alertType: AlertType;
  if (hasPersonalMiss) {
    alertType = "pt_1_miss";
  } else {
    // Apenas grupo — precisa de 2+ DIAS-falta distintos.
    if (trailingMissBuckets.length < 2) return null;
    alertType = "group_2_misses";
  }

  // 7) Treinador "principal" = do event mais recente da streak.
  const mostRecentEvent = allTrailingEvents[allTrailingEvents.length - 1];

  return {
    studentId,
    alertType,
    missedSessionIds: allTrailingEvents.map((e) => e.sessionId),
    missedBookingIds: allTrailingEvents
      .map((e) => e.bookingId)
      .filter((x): x is string => x !== null),
    missedDates: trailingMissBuckets.map((b) => b.date),
    lastAttendedAt,
    primaryTrainerId: mostRecentEvent.trainerId,
  };
}

/**
 * Roda evaluateStudent em lote. Aceita map studentId → eventos.
 */
export function evaluateAll(
  byStudent: Map<string, AttendanceEvent[]>,
): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  for (const [, events] of byStudent) {
    const alert = evaluateStudent(events);
    if (alert) alerts.push(alert);
  }
  return alerts;
}

// ─────────── Assinatura de alerta histórico ───────────

/**
 * Assinatura canônica de um alerta pra detecção de duplicata histórica.
 *
 * Critério: mesma multiset de `missed_dates` (ordenada) + mesmo
 * `alert_type`. NÃO usamos overlap parcial — apenas igualdade exata da
 * lista de datas. Datas dedup'das + ordenadas pra ser invariante a
 * ordem de inserção.
 */
export function alertSignature(args: {
  alertType: AlertType;
  missedDates: ReadonlyArray<string>;
}): string {
  const uniqueSorted = Array.from(new Set(args.missedDates)).sort();
  return `${args.alertType}|${uniqueSorted.join(",")}`;
}

/**
 * Retorna `true` se algum alerta histórico do aluno tem a MESMA
 * assinatura que o novo alerta candidato.
 *
 * Histórico é geralmente alimentado por todos os alertas do aluno (de
 * qualquer status: pending, acknowledged, escalated, resolved,
 * suppressed). Caller decide o escopo.
 */
export function isHistoricalDuplicate(
  candidate: { alertType: AlertType; missedDates: ReadonlyArray<string> },
  history: ReadonlyArray<{
    alert_type: AlertType;
    missed_dates: ReadonlyArray<string>;
  }>,
): boolean {
  const target = alertSignature({
    alertType: candidate.alertType,
    missedDates: candidate.missedDates,
  });
  return history.some(
    (h) =>
      alertSignature({
        alertType: h.alert_type,
        missedDates: h.missed_dates,
      }) === target,
  );
}

// ─────────── Janela de envio (horário social) ───────────

export interface SendWindow {
  startHour: number;     // 0-23 (inclusive)
  endHour: number;       // 0-23 (exclusive)
  daysOfWeek: number[];  // 0=domingo, 1=segunda, ... 6=sábado
}

/**
 * `now` deve estar JÁ no fuso desejado (chamador converte antes).
 */
export function isWithinSendWindow(now: Date, window: SendWindow): boolean {
  const day = now.getDay();
  if (!window.daysOfWeek.includes(day)) return false;
  const hour = now.getHours();
  return hour >= window.startHour && hour < window.endHour;
}
