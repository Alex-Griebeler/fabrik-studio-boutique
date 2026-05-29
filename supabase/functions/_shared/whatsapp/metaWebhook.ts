// Helpers puros pro webhook da Meta WhatsApp Cloud API.
//
// Sem I/O e sem dependência de Supabase — testáveis isoladamente.
// A edge function `receive-whatsapp-meta` usa estas funções pra:
//   - validar a assinatura HMAC do POST (`verifyMetaSignature`)
//   - extrair `statuses[]` / contar `messages[]` (`parseMetaWebhookPayload`)
//   - normalizar cada status num shape canônico (`normalizeMetaStatus`)
//
// Referência do payload:
// https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples

// ─────────── Tipos do payload Meta ───────────

export interface MetaStatusError {
  code?: number | string;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

export interface MetaRawStatus {
  id?: string; // wamid...
  status?: string; // sent | delivered | read | failed | ...
  timestamp?: string;
  recipient_id?: string;
  errors?: MetaStatusError[];
}

export interface MetaRawMessage {
  id?: string;
  from?: string;
  type?: string;
}

export interface NormalizedMetaStatus {
  /** wamid da mensagem. null se ausente (descartável). */
  wamid: string | null;
  /** status reportado (lowercase). null se ausente. */
  status: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ParsedMetaWebhook {
  statuses: MetaRawStatus[];
  /** mensagens inbound — nesta fase só contamos, não processamos. */
  inboundMessages: MetaRawMessage[];
}

// ─────────── Parsing ───────────

/**
 * Extrai todos os `statuses[]` e `messages[]` de um payload de webhook
 * Meta, varrendo `entry[].changes[]` onde `field === "messages"`.
 * Tolerante a shape parcial — campos ausentes viram arrays vazios.
 */
export function parseMetaWebhookPayload(payload: unknown): ParsedMetaWebhook {
  const statuses: MetaRawStatus[] = [];
  const inboundMessages: MetaRawMessage[] = [];

  if (!payload || typeof payload !== "object") {
    return { statuses, inboundMessages };
  }
  const root = payload as { entry?: unknown };
  const entries = Array.isArray(root.entry) ? root.entry : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = Array.isArray((entry as { changes?: unknown }).changes)
      ? (entry as { changes: unknown[] }).changes
      : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const c = change as { field?: unknown; value?: unknown };
      if (c.field !== "messages") continue;
      const value = (c.value ?? {}) as {
        statuses?: unknown;
        messages?: unknown;
      };
      if (Array.isArray(value.statuses)) {
        for (const s of value.statuses) {
          if (s && typeof s === "object") statuses.push(s as MetaRawStatus);
        }
      }
      if (Array.isArray(value.messages)) {
        for (const m of value.messages) {
          if (m && typeof m === "object") {
            inboundMessages.push(m as MetaRawMessage);
          }
        }
      }
    }
  }

  return { statuses, inboundMessages };
}

/**
 * Normaliza um status cru da Meta. Extrai o primeiro erro (se houver)
 * pra code/message canônicos. `status` vai pra lowercase.
 */
export function normalizeMetaStatus(
  raw: MetaRawStatus,
): NormalizedMetaStatus {
  const wamid = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : null;
  const status =
    typeof raw.status === "string" && raw.status.length > 0
      ? raw.status.toLowerCase()
      : null;

  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  const firstError = Array.isArray(raw.errors) ? raw.errors[0] : undefined;
  if (firstError) {
    if (firstError.code !== undefined && firstError.code !== null) {
      errorCode = String(firstError.code);
    }
    errorMessage =
      firstError.error_data?.details ??
      firstError.message ??
      firstError.title ??
      null;
  }

  return { wamid, status, errorCode, errorMessage };
}

// ─────────── Verificação de assinatura ───────────

/**
 * Valida `X-Hub-Signature-256` (formato `sha256=<hex>`) calculando o
 * HMAC SHA-256 do raw body com o app secret. Comparação timing-safe.
 *
 * Usa WebCrypto (`crypto.subtle`) — disponível em Deno e em Node 20+
 * / vitest. Retorna false em qualquer input malformado em vez de
 * lançar, pra a edge function só decidir 200/403.
 */
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string | null | undefined,
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false;
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const providedHex = signatureHeader.slice(prefix.length).trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(providedHex) || providedHex.length === 0) return false;

  const enc = new TextEncoder();
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      enc.encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    return false;
  }

  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const expectedHex = bufToHex(sigBuf);

  return timingSafeEqualHex(expectedHex, providedHex);
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Comparação de hex em tempo constante — não vaza tamanho/posição do
 * primeiro byte divergente via early-return.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Valida o handshake GET de subscrição do webhook. Retorna o
 * `challenge` pra ecoar (200) se o token bate, ou null pra 403.
 */
export function verifyMetaSubscription(args: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  expectedToken: string | null | undefined;
}): string | null {
  if (
    args.mode === "subscribe" &&
    args.token &&
    args.expectedToken &&
    args.token === args.expectedToken
  ) {
    return args.challenge ?? "";
  }
  return null;
}
