// Edge function que sincroniza presença EVO → tabela `attendance_events`.
//
// Fluxo:
//   1. GET /activities/schedule por dia
//   2. Filtra aulas finalizadas (statusName='Finalized' OR status=6)
//   3. GET /activities/schedule/detail pra cada aula finalizada
//      (mesmo com ocupation=0 — pode ter sido aula onde todos faltaram)
//   4. Normaliza enrollments via evo-normalizer
//   5. Coleta idMembers únicos, carrega mappings existentes
//   6. Pra idMembers ainda unmatched/desconhecidos: GET /members em lote,
//      tenta match por CPF normalizado e depois email
//   7. Em dryRun (default): retorna summary com would_* counts, NÃO grava
//   8. Em !dryRun: upsert evo_student_mappings, upsert attendance_events
//      apenas pros eventos cujo aluno foi mapeado
//
// Auth: service_role bearer (cron interno) OU cron secret via header
// `x-attendance-agent-cron-secret`.
//
// Lê secrets de env: EVO_API_BASE_URL, EVO_DNS, EVO_TOKEN, EVO_BRANCH_ID,
// EVO_SYNC_DRY_RUN (default "true").
//
// Não cria aluno automaticamente. Não escreve em sessions/class_bookings.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  deriveSessionType,
  evoSourceId,
  findStudentMatch,
  findTrainerMatch,
  normalizeEvoEnrollment,
  normalizeInstructorName,
  type EvoEnrollment,
  type EvoMember,
  type EvoNormalizedStatus,
  type StudentMatchMethod,
  type StudentRecord,
  type TrainerMatchMethod,
  type TrainerRecord,
} from "../_shared/attendance/evo-normalizer.ts";
import { hasValidAttendanceCronSecret } from "../_shared/attendance/cronAuth.ts";
import {
  DEFAULT_BACKOFF_MS,
  DEFAULT_RETRY_ATTEMPTS,
  EVO_BODY_PARSE_FAILED_PREFIX,
  EVO_BODY_READ_FAILED_PREFIX,
  EVO_FETCH_FAILED_PREFIX,
  isTransientError,
  withRetry,
} from "../_shared/attendance/evo-retry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-attendance-agent-cron-secret",
};

// ─────────── Tipos ───────────

interface SyncBody {
  date?: string;
  dateStart?: string;
  dateEnd?: string;
  dryRun?: boolean;
  /** Limite de aulas pra buscar detail (proteção quota EVO PLUS). */
  limitDetails?: number;
  /** Limite de members buscados em 1 batch (default 50, max 100). */
  memberBatchSize?: number;
}

interface ScheduleItem {
  idAtividadeSessao?: number | string;
  idActivitySession?: number | string;
  idConfiguration?: number | string | null;
  name?: string | null;
  area?: string | null;
  capacity?: number | null;
  ocupation?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  activityDate?: string | null;
  instructor?: string | null;
  status?: number | string | null;
  statusName?: string | null;
}

interface DetailEnrollment {
  idMember?: number | string | null;
  idEmployee?: number | string | null;
  status?: number | null;
  justifiedAbsence?: boolean | null;
  removed?: boolean | null;
  suspended?: boolean | null;
  replacement?: boolean | null;
  exclusive?: boolean | null;
  slotNumber?: number | null;
}

interface DetailResponse {
  idActivitySession?: number | string;
  name?: string | null;
  date?: string | null;
  capacity?: number | null;
  ocupation?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  instructor?: string | null;
  area?: string | null;
  branchName?: string | null;
  status?: number | null;
  statusName?: string | null;
  enrollments?: DetailEnrollment[];
}

interface SyncSummary {
  dry_run: boolean;
  date: string;
  schedule_count: number;
  finalized_count: number;
  details_fetched: number;
  enrollments_seen: number;
  present_count: number;
  no_show_count: number;
  cancelled_on_time_count: number;
  cancelled_late_count: number;
  ignored_count: number;
  // Member sync / matching
  members_fetched: number;
  mappings_existing: number;
  mapped_students: number;
  unmapped_students: number;
  would_map_by_cpf: number;
  would_map_by_email: number;
  would_unmatched: number;
  mapped_trainers: number;
  unmapped_trainers: number;
  // Persistência
  upserted: number;
  errors: string[];
}

// ─────────── Entry point ───────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: service_role bearer OU cron secret
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronAuthorized = await hasValidAttendanceCronSecret(req, supabase);
    if (!authHeader.startsWith("Bearer ")) {
      if (!cronAuthorized) {
        return jsonError(401, "Missing Authorization or cron secret");
      }
    } else {
      const token = authHeader.replace("Bearer ", "");
      if (token !== serviceKey && !isServiceRoleJwt(token) && !cronAuthorized) {
        return jsonError(403, "Service-role required");
      }
    }

    const body = ((await req.json().catch(() => ({}))) ?? {}) as SyncBody;

    // Resolução do flag dry-run: body > env > default true
    const envDryRun = (Deno.env.get("EVO_SYNC_DRY_RUN") ?? "true").toLowerCase();
    const envDryRunFlag = envDryRun !== "false";
    const dryRun = body.dryRun !== undefined ? body.dryRun : envDryRunFlag;

    // Datas
    const dateStr = body.date ?? body.dateStart ?? defaultYesterdaySP();
    const dateEnd = body.dateEnd ?? dateStr;
    if (!isValidIsoDate(dateStr) || !isValidIsoDate(dateEnd)) {
      return jsonError(400, "Invalid date(s); expected YYYY-MM-DD");
    }
    if (dateEnd < dateStr) {
      return jsonError(400, "dateEnd must be >= dateStart");
    }

    // EVO env
    // URL pública documentada do EVO; pode ser sobrescrita via secret se necessário.
    const evoBaseUrl = Deno.env.get("EVO_API_BASE_URL") ?? "https://evo-integracao-api.w12app.com.br";
    const evoDns = Deno.env.get("EVO_DNS");
    const evoToken = Deno.env.get("EVO_TOKEN");
    const evoBranchId = Deno.env.get("EVO_BRANCH_ID") ?? "1";
    if (!evoDns || !evoToken) {
      return jsonError(500, "EVO env not configured (missing EVO_DNS or EVO_TOKEN)");
    }
    const evoAuth = "Basic " + base64(`${evoDns}:${evoToken}`);
    const memberBatchSize = clamp(body.memberBatchSize ?? 50, 1, 100);

    // Loop por dia
    const days = expandDateRange(dateStr, dateEnd);
    const summaries: SyncSummary[] = [];
    for (const day of days) {
      const summary = await syncOneDay({
        day,
        dryRun,
        limitDetails: body.limitDetails,
        memberBatchSize,
        evoBaseUrl,
        evoAuth,
        evoBranchId,
        supabase,
      });
      summaries.push(summary);
    }

    if (summaries.length === 1) return jsonOk(summaries[0]);
    return jsonOk({ days: summaries });
  } catch (err) {
    console.error("sync-evo-attendance fatal:", err);
    return jsonError(500, (err as Error).message ?? "internal error");
  }
});

// ─────────── Sync de 1 dia ───────────

interface PendingEvent {
  evoSessionId: string;
  evoMemberId: string;
  status: EvoNormalizedStatus;
  eventDate: string;
  startTime: string;
  modality: string;
  sessionType: "personal" | "group";
  instructorName: string | null;
  evoEmployeeId: string | null;
  rawEnrollment: DetailEnrollment;
}

async function syncOneDay(args: {
  day: string;
  dryRun: boolean;
  limitDetails?: number;
  memberBatchSize: number;
  evoBaseUrl: string;
  evoAuth: string;
  evoBranchId: string;
  supabase: SupabaseClient;
}): Promise<SyncSummary> {
  const { day, dryRun, limitDetails, memberBatchSize, evoBaseUrl, evoAuth, evoBranchId, supabase } = args;

  const summary: SyncSummary = {
    dry_run: dryRun,
    date: day,
    schedule_count: 0,
    finalized_count: 0,
    details_fetched: 0,
    enrollments_seen: 0,
    present_count: 0,
    no_show_count: 0,
    cancelled_on_time_count: 0,
    cancelled_late_count: 0,
    ignored_count: 0,
    members_fetched: 0,
    mappings_existing: 0,
    mapped_students: 0,
    unmapped_students: 0,
    would_map_by_cpf: 0,
    would_map_by_email: 0,
    would_unmatched: 0,
    mapped_trainers: 0,
    unmapped_trainers: 0,
    upserted: 0,
    errors: [],
  };

  // 1) Schedule
  const scheduleUrl = `${evoBaseUrl}/api/v1/activities/schedule?date=${day}&idBranch=${evoBranchId}&showFullWeek=false`;
  const schedule = await evoFetchJson<ScheduleItem[]>(scheduleUrl, evoAuth);
  summary.schedule_count = Array.isArray(schedule) ? schedule.length : 0;

  // 2) Filtro de finalizadas — mantém ocupation=0 (todos podem ter faltado)
  const finalized = (schedule ?? []).filter(
    (a) => a.statusName === "Finalized" || a.status === 6,
  );
  summary.finalized_count = finalized.length;

  const detailsToFetch =
    typeof limitDetails === "number" && limitDetails > 0
      ? finalized.slice(0, limitDetails)
      : finalized;

  // 3) Detail por aula
  const allEvents: PendingEvent[] = [];
  for (const aula of detailsToFetch) {
    try {
      const sessionId = aula.idAtividadeSessao ?? aula.idActivitySession;
      if (sessionId == null) {
        summary.errors.push(`schedule item without session id`);
        continue;
      }
      const detail = await evoFetchJson<DetailResponse>(
        `${evoBaseUrl}/api/v1/activities/schedule/detail?idActivitySession=${sessionId}`,
        evoAuth,
      );
      summary.details_fetched++;

      const enrollments = detail?.enrollments ?? [];
      summary.enrollments_seen += enrollments.length;

      for (const enr of enrollments) {
        const result = normalizeEvoEnrollment(enr as EvoEnrollment);
        if (result.status === null) {
          summary.ignored_count++;
          continue;
        }
        countByStatus(summary, result.status);

        if (enr.idMember == null) {
          summary.errors.push(`enrollment without idMember in session ${sessionId}`);
          continue;
        }

        allEvents.push({
          evoSessionId: String(sessionId),
          evoMemberId: String(enr.idMember),
          status: result.status,
          eventDate: detail?.date ?? aula.activityDate ?? day,
          startTime: detail?.startTime ?? aula.startTime ?? "00:00",
          modality: (detail?.name ?? aula.name ?? "").trim() || "—",
          sessionType: deriveSessionType(detail?.capacity ?? aula.capacity),
          instructorName: detail?.instructor ?? aula.instructor ?? null,
          evoEmployeeId: enr.idEmployee != null ? String(enr.idEmployee) : null,
          rawEnrollment: enr,
        });
      }
    } catch (err) {
      summary.errors.push(
        `detail fetch failed: ${(err as Error).message ?? String(err)}`,
      );
    }
  }

  if (allEvents.length === 0) return summary;

  // 4) Coleta idMembers únicos
  const evoMemberIds = Array.from(new Set(allEvents.map((e) => e.evoMemberId)));

  // 5) Carrega mappings existentes
  const existingMappings = await loadExistingStudentMappings(supabase, evoMemberIds);
  summary.mappings_existing = existingMappings.size;

  // 6) Identifica members que precisam de fetch (sem mapping ou unmatched)
  const idsToFetch = evoMemberIds.filter((id) => {
    const m = existingMappings.get(id);
    return !m || m.method === "unmatched";
  });

  // 7) Carrega students do CRM (pra matching local)
  const students = await loadActiveStudents(supabase);

  // 8) Resolve novos matches via fetch EVO + match local
  const newMatches = new Map<string, MappingState>();
  if (idsToFetch.length > 0) {
    try {
      const members = await fetchEvoMembersBatched({
        ids: idsToFetch,
        evoBaseUrl,
        evoAuth,
        evoBranchId,
        batchSize: memberBatchSize,
      });
      summary.members_fetched = members.size;

      for (const id of idsToFetch) {
        const member = members.get(id);
        if (!member) {
          // Member não veio do EVO — registra unmatched mesmo assim
          newMatches.set(id, {
            studentId: null,
            method: "unmatched",
            raw: null,
          });
          continue;
        }
        const match = findStudentMatch(member, students);
        newMatches.set(id, {
          studentId: match.studentId,
          method: match.method,
          raw: sanitizeMemberRaw(member),
        });
      }
    } catch (err) {
      summary.errors.push(
        `members fetch failed: ${(err as Error).message ?? String(err)}`,
      );
    }
  }

  // 9) Resolved = existing ∪ newMatches (newMatches sobrescreve unmatched antigo)
  const resolved = new Map<string, MappingState>();
  for (const [id, m] of existingMappings) {
    resolved.set(id, m);
  }
  for (const [id, m] of newMatches) {
    resolved.set(id, m);
  }

  // 10) Contadores would_* + mapped/unmapped
  for (const id of evoMemberIds) {
    const m = resolved.get(id);
    if (m?.studentId) {
      summary.mapped_students++;
      if (m.method === "cpf") summary.would_map_by_cpf++;
      else if (m.method === "email") summary.would_map_by_email++;
    } else {
      summary.unmapped_students++;
      summary.would_unmatched++;
    }
  }

  // 11) Trainers — combina mappings persistidos + fallback por nome
  //     normalizado contra `trainers.full_name` (não chama EVO).
  const trainerInputs = allEvents.map((e) => ({
    id: e.evoEmployeeId,
    name: e.instructorName,
  }));
  const trainerMappings = await resolveTrainerMappings(supabase, trainerInputs);
  const trainersActive = await loadActiveTrainers(supabase);
  const newTrainerMatches = new Map<
    string,
    { trainerId: string | null; method: TrainerMatchMethod; key: string; idEmployee: string | null; instructorName: string | null }
  >();

  for (const ev of allEvents) {
    const key = trainerMapKey(ev.evoEmployeeId, ev.instructorName);
    if (!key) {
      summary.unmapped_trainers++;
      continue;
    }
    const persisted = trainerMappings.get(key);
    if (persisted?.trainerId) {
      summary.mapped_trainers++;
      continue;
    }
    // Tenta resolver via match local (se ainda não tem na evo_trainer_mappings)
    if (!newTrainerMatches.has(key)) {
      const m = findTrainerMatch(ev.instructorName, trainersActive);
      newTrainerMatches.set(key, {
        trainerId: m.trainerId,
        method: m.method,
        key,
        idEmployee: ev.evoEmployeeId,
        instructorName: normalizeInstructorName(ev.instructorName),
      });
    }
    const cached = newTrainerMatches.get(key)!;
    if (cached.trainerId) summary.mapped_trainers++;
    else summary.unmapped_trainers++;
  }

  // 12) Persistência (apenas se !dryRun)
  if (!dryRun) {
    // 12a) Upsert mappings de aluno novos (existing já estão no banco)
    if (newMatches.size > 0) {
      const mappingRows = Array.from(newMatches.entries()).map(([id, m]) => ({
        evo_member_id: id,
        student_id: m.studentId,
        match_method: m.method,
        raw: m.raw as unknown as Record<string, unknown> | null,
        last_synced_at: new Date().toISOString(),
      }));
      const { error: mErr } = await supabase
        .from("evo_student_mappings")
        .upsert(mappingRows, { onConflict: "evo_member_id" });
      if (mErr) summary.errors.push(`student mappings upsert: ${mErr.message}`);
    }

    // 12b) Upsert mappings de trainer novos (somente os com idEmployee
    //      ou nome — index único cobre cada caso separadamente).
    const trainerMappingRows = Array.from(newTrainerMatches.values())
      .filter((m) => m.idEmployee || m.instructorName)
      .map((m) => ({
        evo_employee_id: m.idEmployee,
        evo_instructor_name: m.idEmployee ? null : m.instructorName,
        trainer_id: m.trainerId,
        match_method: m.method,
        last_synced_at: new Date().toISOString(),
      }));
    if (trainerMappingRows.length > 0) {
      // 2 upserts separados por causa do índice único condicional
      // (evo_employee_id quando presente; evo_instructor_name caso contrário).
      const byId = trainerMappingRows.filter((r) => r.evo_employee_id);
      const byName = trainerMappingRows.filter((r) => !r.evo_employee_id);
      if (byId.length > 0) {
        const { error: tErr } = await supabase
          .from("evo_trainer_mappings")
          .upsert(byId, { onConflict: "evo_employee_id" });
        if (tErr) summary.errors.push(`trainer mappings (by id) upsert: ${tErr.message}`);
      }
      if (byName.length > 0) {
        const { error: tErr } = await supabase
          .from("evo_trainer_mappings")
          .upsert(byName, { onConflict: "evo_instructor_name" });
        if (tErr) summary.errors.push(`trainer mappings (by name) upsert: ${tErr.message}`);
      }
    }

    // 12c) Upsert attendance_events SOMENTE pros eventos com aluno mapeado
    const eventRows = allEvents
      .map((ev) => {
        const m = resolved.get(ev.evoMemberId);
        if (!m?.studentId) return null;
        const key = trainerMapKey(ev.evoEmployeeId, ev.instructorName);
        const persisted = key ? trainerMappings.get(key) : null;
        const fresh = key ? newTrainerMatches.get(key) : null;
        const trainerId = persisted?.trainerId ?? fresh?.trainerId ?? null;
        return {
          student_id: m.studentId,
          trainer_id: trainerId,
          assistant_trainer_id: null,
          event_date: ev.eventDate,
          start_time: ev.startTime,
          modality: ev.modality,
          session_type: ev.sessionType,
          status: ev.status,
          source: "evo" as const,
          source_id: evoSourceId(ev.evoSessionId, ev.evoMemberId),
          source_synced_at: new Date().toISOString(),
          raw: ev.rawEnrollment as unknown as Record<string, unknown>,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (eventRows.length > 0) {
      const { error: upErr, count } = await supabase
        .from("attendance_events")
        .upsert(eventRows, {
          onConflict: "source,source_id",
          count: "exact",
        });
      if (upErr) summary.errors.push(`events upsert: ${upErr.message}`);
      else summary.upserted = count ?? eventRows.length;
    }
  }

  return summary;
}

async function loadActiveTrainers(
  supabase: SupabaseClient,
): Promise<TrainerRecord[]> {
  const { data, error } = await supabase
    .from("trainers")
    .select("id, full_name, email, is_active")
    .eq("is_active", true);
  if (error) throw new Error(`load trainers: ${error.message}`);
  return (data ?? []) as TrainerRecord[];
}

// ─────────── Mappings ───────────

interface MappingState {
  studentId: string | null;
  method: StudentMatchMethod;
  raw: Record<string, unknown> | null;
}

async function loadExistingStudentMappings(
  supabase: SupabaseClient,
  evoMemberIds: string[],
): Promise<Map<string, MappingState>> {
  const map = new Map<string, MappingState>();
  if (evoMemberIds.length === 0) return map;

  const { data, error } = await supabase
    .from("evo_student_mappings")
    .select("evo_member_id, student_id, match_method, raw")
    .in("evo_member_id", evoMemberIds);
  if (error) {
    console.warn("load student mappings:", error.message);
    return map;
  }
  for (const row of (data ?? []) as Array<{
    evo_member_id: string;
    student_id: string | null;
    match_method: StudentMatchMethod;
    raw: Record<string, unknown> | null;
  }>) {
    map.set(row.evo_member_id, {
      studentId: row.student_id,
      method: row.match_method,
      raw: row.raw,
    });
  }
  return map;
}

async function loadActiveStudents(
  supabase: SupabaseClient,
): Promise<StudentRecord[]> {
  const { data, error } = await supabase
    .from("students")
    .select("id, cpf, email")
    .eq("is_active", true);
  if (error) throw new Error(`load students: ${error.message}`);
  return (data ?? []) as StudentRecord[];
}

async function resolveTrainerMappings(
  supabase: SupabaseClient,
  inputs: Array<{ id: string | null; name: string | null }>,
): Promise<Map<string, { trainerId: string | null; method: string }>> {
  const map = new Map<string, { trainerId: string | null; method: string }>();
  const ids = Array.from(
    new Set(inputs.map((i) => i.id).filter((x): x is string => !!x)),
  );
  const names = Array.from(
    new Set(
      inputs
        .map((i) => normalizeInstructorName(i.name))
        .filter((x): x is string => !!x),
    ),
  );
  if (ids.length === 0 && names.length === 0) return map;

  const queries: Promise<unknown>[] = [];
  if (ids.length > 0) {
    queries.push(
      supabase
        .from("evo_trainer_mappings")
        .select("evo_employee_id, evo_instructor_name, trainer_id, match_method")
        .in("evo_employee_id", ids),
    );
  }
  if (names.length > 0) {
    queries.push(
      supabase
        .from("evo_trainer_mappings")
        .select("evo_employee_id, evo_instructor_name, trainer_id, match_method")
        .in("evo_instructor_name", names),
    );
  }

  const results = await Promise.all(queries);
  for (const r of results as Array<{
    data: Array<{
      evo_employee_id: string | null;
      evo_instructor_name: string | null;
      trainer_id: string | null;
      match_method: string;
    }> | null;
    error: { message: string } | null;
  }>) {
    if (r.error || !r.data) continue;
    for (const row of r.data) {
      const key = trainerMapKey(row.evo_employee_id, row.evo_instructor_name);
      if (key) {
        map.set(key, { trainerId: row.trainer_id, method: row.match_method });
      }
    }
  }
  return map;
}

function trainerMapKey(
  employeeId: string | null,
  instructorName: string | null,
): string | null {
  if (employeeId) return `id:${employeeId}`;
  const norm = normalizeInstructorName(instructorName);
  if (norm) return `name:${norm}`;
  return null;
}

// ─────────── EVO members fetch ───────────

/**
 * Busca members EVO em batches. Endpoints (em ordem de preferência):
 *
 *   1. GET /api/v2/members?idsMembers={csv}&take=N&idBranch={id}  (preferencial — confirmado na Fase 1)
 *   2. GET /api/v2/members/{id}                                    (fallback individual em v2)
 *   3. GET /api/v1/members?idsMembers={csv}&take=N&idBranch={id}   (fallback terciário em v1)
 *   4. GET /api/v1/members/{id}                                    (último recurso)
 *
 * Cai pro próximo nível ao receber 4xx (404/400). Outros erros (5xx,
 * rede) propagam pro caller.
 */
async function fetchEvoMembersBatched(args: {
  ids: string[];
  evoBaseUrl: string;
  evoAuth: string;
  evoBranchId: string;
  batchSize: number;
}): Promise<Map<string, EvoMember>> {
  const { ids, evoBaseUrl, evoAuth, evoBranchId, batchSize } = args;
  const out = new Map<string, EvoMember>();
  if (ids.length === 0) return out;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const csv = batch.join(",");
    const v2BatchUrl = `${evoBaseUrl}/api/v2/members?idsMembers=${encodeURIComponent(csv)}&take=${batchSize}&idBranch=${evoBranchId}`;

    let batchOk = false;
    try {
      const data = await evoFetchJson<unknown>(v2BatchUrl, evoAuth);
      const list = extractEvoMembers(data);
      for (const m of list) {
        if (m.idMember != null) out.set(String(m.idMember), m);
      }
      batchOk = true;
    } catch (err) {
      if (!is4xx(err)) throw err;
      console.warn(
        `EVO v2 batch failed (${shortErr(err)}); trying v2 per-id`,
      );
    }

    if (batchOk) continue;

    // Fallback 1: v2 individual
    let v2IndividualOk = false;
    try {
      for (const id of batch) {
        try {
          const m = await evoFetchJson<EvoMember>(
            `${evoBaseUrl}/api/v2/members/${encodeURIComponent(id)}`,
            evoAuth,
          );
          if (m && m.idMember != null) out.set(String(m.idMember), m);
        } catch (innerErr) {
          if (!is4xx(innerErr)) throw innerErr;
          // 4xx no individual: não tem esse id no v2; pula
        }
      }
      v2IndividualOk = true;
    } catch (err) {
      if (!is4xx(err)) throw err;
      console.warn(
        `EVO v2 individual failed (${shortErr(err)}); trying v1 batch`,
      );
    }

    if (v2IndividualOk) continue;

    // Fallback 2: v1 batch
    let v1BatchOk = false;
    try {
      const v1BatchUrl = `${evoBaseUrl}/api/v1/members?idsMembers=${encodeURIComponent(csv)}&take=${batchSize}&idBranch=${evoBranchId}`;
      const data = await evoFetchJson<unknown>(v1BatchUrl, evoAuth);
      const list = extractEvoMembers(data);
      for (const m of list) {
        if (m.idMember != null) out.set(String(m.idMember), m);
      }
      v1BatchOk = true;
    } catch (err) {
      if (!is4xx(err)) throw err;
      console.warn(
        `EVO v1 batch failed (${shortErr(err)}); trying v1 per-id`,
      );
    }

    if (v1BatchOk) continue;

    // Fallback 3: v1 individual (último recurso)
    for (const id of batch) {
      try {
        const m = await evoFetchJson<EvoMember>(
          `${evoBaseUrl}/api/v1/members/${encodeURIComponent(id)}`,
          evoAuth,
        );
        if (m && m.idMember != null) out.set(String(m.idMember), m);
      } catch (innerErr) {
        if (!is4xx(innerErr)) throw innerErr;
        // 4xx no individual: id não existe; pula
      }
    }
  }
  return out;
}

function extractEvoMembers(data: unknown): EvoMember[] {
  if (Array.isArray(data)) return data as EvoMember[];
  if (!data || typeof data !== "object") return [];

  const obj = data as Record<string, unknown>;
  const candidates = [
    obj.items,
    obj.data,
    obj.result,
    obj.results,
    obj.members,
    obj.content,
    obj.list,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as EvoMember[];
  }
  return [];
}

function is4xx(err: unknown): boolean {
  const msg = (err as Error).message ?? "";
  return /\bEVO 4\d\d\b/.test(msg);
}

function shortErr(err: unknown): string {
  const msg = (err as Error).message ?? String(err);
  return msg.slice(0, 80);
}

/** Mantém só campos úteis pro `raw`, descarta blobs grandes. */
function sanitizeMemberRaw(m: EvoMember): Record<string, unknown> {
  return {
    idMember: m.idMember,
    document: m.document ?? m.cpf ?? null,
    email: m.email ?? null,
  };
}

// ─────────── Helpers ───────────

function countByStatus(s: SyncSummary, status: EvoNormalizedStatus): void {
  switch (status) {
    case "present":
      s.present_count++;
      break;
    case "no_show":
      s.no_show_count++;
      break;
    case "cancelled_on_time":
      s.cancelled_on_time_count++;
      break;
    case "cancelled_late":
      s.cancelled_late_count++;
      break;
  }
}

/**
 * Faz UMA tentativa de GET autenticado contra a API EVO. Lança erros
 * com prefixos reconhecidos por `isTransientError`:
 *   - `EVO_FETCH_FAILED:`        — falha de rede / TypeError no fetch
 *   - `EVO_BODY_READ_FAILED:`    — conexão morre lendo body
 *   - `EVO_BODY_PARSE_FAILED:`   — JSON inválido em resposta 2xx
 *   - `EVO <status> <url>: ...`  — HTTP non-2xx (preserva formato
 *                                    consumido por `is4xx`)
 */
async function evoFetchJsonOnce<T>(url: string, auth: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: auth,
        Accept: "application/json",
      },
    });
  } catch (err) {
    throw new Error(`${EVO_FETCH_FAILED_PREFIX} ${(err as Error)?.message ?? String(err)}`);
  }

  if (!res.ok) {
    let text = "";
    try {
      text = await res.text();
    } catch {
      // ignore — apenas inclui um placeholder pra preservar formato
    }
    throw new Error(`EVO ${res.status} ${redactUrl(url)}: ${text.slice(0, 200)}`);
  }

  let bodyText: string;
  try {
    bodyText = await res.text();
  } catch (err) {
    throw new Error(
      `${EVO_BODY_READ_FAILED_PREFIX} ${(err as Error)?.message ?? String(err)}`,
    );
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch (err) {
    throw new Error(
      `${EVO_BODY_PARSE_FAILED_PREFIX} ${(err as Error)?.message ?? String(err)}`,
    );
  }
}

/**
 * Wrapper com retry de erros transitórios (5xx, 429, falhas de rede,
 * falhas lendo/parseando body). 4xx propaga imediatamente — caller
 * (`fetchEvoMembersBatched`) usa pra cair no fallback v2→v1.
 *
 * Após esgotar tentativas, agrega numa mensagem útil:
 *   `EVO request failed after N attempts: GET <url> — last error: ...`
 */
async function evoFetchJson<T>(url: string, auth: string): Promise<T> {
  try {
    return await withRetry(() => evoFetchJsonOnce<T>(url, auth), {
      attempts: DEFAULT_RETRY_ATTEMPTS,
      backoffMs: DEFAULT_BACKOFF_MS,
      isTransient: isTransientError,
      onAttemptFailed: (attempt, err, waitMs) => {
        console.warn(
          `EVO retry ${attempt + 1}/${DEFAULT_RETRY_ATTEMPTS - 1} in ${waitMs}ms — ${redactUrl(url)} — ${shortErr(err)}`,
        );
      },
    });
  } catch (err) {
    if (isTransientError(err)) {
      throw new Error(
        `EVO request failed after ${DEFAULT_RETRY_ATTEMPTS} attempts: GET ${redactUrl(url)} — last error: ${(err as Error)?.message ?? String(err)}`,
      );
    }
    throw err;
  }
}

/** Remove query string pra não vazar `idsMembers`/parâmetros nos logs. */
function redactUrl(url: string): string {
  const idx = url.indexOf("?");
  return idx === -1 ? url : url.slice(0, idx) + "?…";
}

function base64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function isServiceRoleJwt(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function expandDateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(start + "T12:00:00Z");
  const last = new Date(end + "T12:00:00Z");
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function defaultYesterdaySP(): string {
  // Ontem na timezone America/Sao_Paulo (UTC-3, sem DST desde 2019)
  const now = new Date();
  now.setUTCHours(now.getUTCHours() - 3);
  now.setUTCDate(now.getUTCDate() - 1);
  return now.toISOString().slice(0, 10);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type { EvoNormalizedStatus };
