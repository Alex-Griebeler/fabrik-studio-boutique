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
  sessionId: string;          // sempre presente: é o id da `sessions`
  bookingId: string | null;   // setado quando vem de class_bookings (group)
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
  missedDates: string[];      // ISO yyyy-mm-dd, oldest → newest
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
 * Decide o alerta pra UM aluno baseado no histórico recente de eventos.
 * Retorna null se o aluno não está em risco.
 */
export function evaluateStudent(events: AttendanceEvent[]): RiskAlert | null {
  if (events.length === 0) return null;
  const studentId = events[0].studentId;

  const sorted = sortChronological(events);

  // 1) Última presença pro contexto da mensagem (qualquer status 'present')
  const lastPresent = [...sorted].reverse().find((e) => e.status === "present");
  const lastAttendedAt = lastPresent ? lastPresent.date : null;

  // 2) Filtrar pra eventos que CONTAM (present / no_show / cancelled_late) — ignora
  //    cancelled_on_time (não quebra streak nem conta como falta) e scheduled (futuro).
  const countable = sorted.filter((e) => COUNTABLE_STATUSES.has(e.status));

  if (countable.length === 0) return null;

  // 3) Olhar do mais recente pro mais antigo, pegando a streak final de faltas.
  const trailingMisses: AttendanceEvent[] = [];
  for (let i = countable.length - 1; i >= 0; i--) {
    const ev = countable[i];
    if (MISS_STATUSES.has(ev.status)) {
      trailingMisses.unshift(ev);
    } else {
      break; // streak quebra na primeira presença
    }
  }

  if (trailingMisses.length === 0) return null;

  // 4) Decisão de tipo de alerta.
  //    Se QUALQUER falta na streak é em sessão personal → trata como PT (1 falta basta).
  const hasPersonalMiss = trailingMisses.some((e) => e.sessionType === "personal");

  let alertType: AlertType;
  let relevantMisses: AttendanceEvent[];

  if (hasPersonalMiss) {
    alertType = "pt_1_miss";
    // Pra PT, o gatilho é a primeira falta personal (geralmente a única).
    // Mas levamos toda a streak pra contextualizar.
    relevantMisses = trailingMisses;
  } else {
    // Apenas grupo — precisa de 2+ faltas seguidas.
    if (trailingMisses.length < 2) return null;
    alertType = "group_2_misses";
    relevantMisses = trailingMisses;
  }

  // 5) Treinador "principal" pra alerta = treinador da falta mais recente.
  const mostRecent = relevantMisses[relevantMisses.length - 1];

  return {
    studentId,
    alertType,
    missedSessionIds: relevantMisses.map((e) => e.sessionId),
    missedBookingIds: relevantMisses
      .map((e) => e.bookingId)
      .filter((x): x is string => x !== null),
    missedDates: relevantMisses.map((e) => e.date),
    lastAttendedAt,
    primaryTrainerId: mostRecent.trainerId,
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
