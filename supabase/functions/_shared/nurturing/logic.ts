export interface NurturingRequestOptions {
  dryRun: boolean;
  limit: number;
}

export function parseNurturingRequest(body: unknown): NurturingRequestOptions {
  const value = isRecord(body) ? body : {};
  const requestedLimit = typeof value.limit === "number" && Number.isFinite(value.limit)
    ? Math.trunc(value.limit)
    : 50;

  return {
    // Falha segura: qualquer chamada que não declare dryRun=false só simula.
    dryRun: value.dryRun !== false,
    limit: Math.min(100, Math.max(1, requestedLimit)),
  };
}

export function normalizeRequestId(value: string | null | undefined): string {
  const candidate = value?.trim();
  return candidate && UUID_PATTERN.test(candidate)
    ? candidate.toLowerCase()
    : crypto.randomUUID();
}

export function nurturingIdempotencyKey(
  executionId: string,
  stepId: string,
): string {
  return `${executionId}:${stepId}`;
}

export function renderNurturingMessage(
  template: string | null | undefined,
  lead: { name?: string | null; phone?: string | null; email?: string | null },
): string {
  return (template ?? "")
    .replace(/\{\{lead\.name\}\}/g, lead.name ?? "")
    .replace(/\{\{lead\.phone\}\}/g, lead.phone ?? "")
    .replace(/\{\{lead\.email\}\}/g, lead.email ?? "");
}

export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;

  for (let i = 0; i < length; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }

  return diff === 0;
}

export function isNurturingCronSecret(value: string): boolean {
  return NURTURING_CRON_SECRET_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// A migration gera exatamente 64 caracteres hexadecimais. Validar o formato
// antes de consultar o banco reduz trabalho para chamadas publicas invalidas.
const NURTURING_CRON_SECRET_PATTERN = /^[0-9a-f]{64}$/;
