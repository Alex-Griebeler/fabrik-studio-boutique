// Lógica pura de normalização de enrollment EVO → status canônico do
// agente. Sem I/O. Determinístico e testável.
//
// Mapeamento confirmado na Fase 1 (sample real de 8 sessões finalizadas,
// 20 enrollments):
//
//   - flag.removed=true        → ignore
//   - flag.suspended=true      → ignore
//   - flag.replacement=true    → ignore
//   - flag.justifiedAbsence=true → cancelled_on_time (não conta como falta)
//   - status numérico 0        → present (sempre acompanhado de slotNumber=0;
//                                count(status=0) == ocupation em 100% das amostras)
//   - status numérico 1        → no_show
//   - status numérico 2        → ignore (cancelamento sem timestamp confiável;
//                                conservador até validar em produção)
//   - status desconhecido      → ignore + warning

export type EvoNormalizedStatus =
  | "present"
  | "no_show"
  | "cancelled_late"
  | "cancelled_on_time";

export interface EvoEnrollment {
  status: number | null | undefined;
  justifiedAbsence?: boolean | null;
  removed?: boolean | null;
  suspended?: boolean | null;
  replacement?: boolean | null;
}

export interface EvoNormalizationResult {
  /** Se null, este enrollment deve ser ignorado pelo sync. */
  status: EvoNormalizedStatus | null;
  reason: string;
}

/**
 * Normaliza UM enrollment EVO. Resultado `status=null` significa
 * "ignore" — o caller não deve criar attendance_event pra esse caso,
 * mas DEVE incrementar contador de `ignored_count` no summary.
 */
export function normalizeEvoEnrollment(
  enrollment: EvoEnrollment,
): EvoNormalizationResult {
  // Flags de ignore têm prioridade sobre status numérico
  if (enrollment.removed === true) {
    return { status: null, reason: "removed" };
  }
  if (enrollment.suspended === true) {
    return { status: null, reason: "suspended" };
  }
  if (enrollment.replacement === true) {
    return { status: null, reason: "replacement" };
  }

  // Ausência justificada vira cancelamento on-time (não conta como falta)
  if (enrollment.justifiedAbsence === true) {
    return {
      status: "cancelled_on_time",
      reason: "justified_absence",
    };
  }

  switch (enrollment.status) {
    case 0:
      return { status: "present", reason: "evo_status_0_present" };
    case 1:
      return { status: "no_show", reason: "evo_status_1_no_show" };
    case 2:
      return { status: null, reason: "evo_status_2_cancelled_unknown_timing" };
    default:
      return {
        status: null,
        reason: `evo_status_unknown_${String(enrollment.status)}`,
      };
  }
}

// ─────────── Helpers de domínio ───────────

/**
 * Em todas as amostras observadas, capacity=1 = sessão personal e
 * capacity>1 = turma em grupo. Mantemos como heurística — caso EVO
 * exponha um campo dedicado no futuro, prefira esse.
 */
export function deriveSessionType(capacity: number | null | undefined): "personal" | "group" {
  return capacity === 1 ? "personal" : "group";
}

/** Normaliza CPF/RG removendo caracteres não-dígito. */
export function normalizeDocument(doc: string | null | undefined): string | null {
  if (!doc) return null;
  const digits = doc.replace(/\D+/g, "");
  return digits.length > 0 ? digits : null;
}

/** Normaliza email lowercase + trim. */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** Normaliza nome de instrutor pra match (lowercase, trim, colapsa espaços, sem acento). */
export function normalizeInstructorName(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Constrói o source_id canônico de um enrollment EVO:
 *   "{idActivitySession}:{idMember}"
 * Esse valor entra como (source='evo', source_id) no unique index.
 */
export function evoSourceId(
  idActivitySession: number | string,
  idMember: number | string,
): string {
  return `${idActivitySession}:${idMember}`;
}

// ─────────── Matching EVO member → CRM student ───────────

export type StudentMatchMethod = "cpf" | "email" | "manual" | "unmatched";

export interface EvoMember {
  /** EVO retorna como número; aceitamos string pra robustez */
  idMember: number | string;
  /** Campos típicos: `document`, `cpf`, ou ambos */
  document?: string | null;
  cpf?: string | null;
  email?: string | null;
}

export interface StudentRecord {
  id: string;
  cpf: string | null;
  email: string | null;
}

export interface StudentMatchResult {
  studentId: string | null;
  method: StudentMatchMethod;
}

/**
 * Encontra o `students.id` que casa com um member EVO.
 * Ordem: 1) CPF normalizado, 2) email lowercase. Se nenhum bate,
 * retorna `unmatched`. NÃO cria aluno automaticamente.
 *
 * Pré-requisito: caller passa `students` já carregados (Map<id, record>).
 * A normalização cruzada (CPF dos students, email dos students) também
 * é feita aqui pra garantir consistência.
 */
export function findStudentMatch(
  member: EvoMember,
  students: ReadonlyArray<StudentRecord>,
): StudentMatchResult {
  const memberCpf = normalizeDocument(member.document ?? member.cpf);
  const memberEmail = normalizeEmail(member.email);

  if (memberCpf) {
    for (const s of students) {
      const sCpf = normalizeDocument(s.cpf);
      if (sCpf && sCpf === memberCpf) {
        return { studentId: s.id, method: "cpf" };
      }
    }
  }

  if (memberEmail) {
    for (const s of students) {
      const sEmail = normalizeEmail(s.email);
      if (sEmail && sEmail === memberEmail) {
        return { studentId: s.id, method: "email" };
      }
    }
  }

  return { studentId: null, method: "unmatched" };
}

// ─────────── Matching EVO instructor → CRM trainer ───────────

export type TrainerMatchMethod = "email" | "name" | "manual" | "unmatched";

export interface TrainerRecord {
  id: string;
  full_name: string;
  email?: string | null;
  is_active?: boolean | null;
}

export interface TrainerMatchResult {
  trainerId: string | null;
  method: TrainerMatchMethod;
}

/**
 * Encontra o `trainers.id` que casa com um nome de instrutor EVO.
 * Hoje só faz match por nome normalizado (lower, sem acento, espaço
 * único). EVO envia `idEmployee=null` na amostra real, então não temos
 * email do instrutor — daí o fallback ser por nome.
 *
 * Caller passa apenas trainers com `is_active=true` se quiser excluir
 * desligados; a função aqui não filtra.
 */
export function findTrainerMatch(
  instructorName: string | null | undefined,
  trainers: ReadonlyArray<TrainerRecord>,
): TrainerMatchResult {
  const target = normalizeInstructorName(instructorName);
  if (!target) return { trainerId: null, method: "unmatched" };

  for (const t of trainers) {
    const tName = normalizeInstructorName(t.full_name);
    if (tName && tName === target) {
      return { trainerId: t.id, method: "name" };
    }
  }
  return { trainerId: null, method: "unmatched" };
}
