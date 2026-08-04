// Verificação de assinatura de webhook da Twilio (X-Twilio-Signature).
//
// Algoritmo (docs oficiais da Twilio, "Validating Signatures"):
//   1. Parte da URL completa do webhook, exatamente como configurada na
//      Twilio (esquema + host + path + query string).
//   2. Ordena os parâmetros do POST form-urlencoded alfabeticamente pela
//      chave e concatena `chave + valor` (sem separadores) ao final da URL.
//   3. HMAC-SHA1 dessa string com o Auth Token da conta, em Base64.
//   4. Compara com o header `X-Twilio-Signature`.
//
// Usa WebCrypto (`crypto.subtle`) — disponível em Deno e em Node 20+ /
// vitest. Retorna false em qualquer input malformado em vez de lançar,
// pra edge function só decidir 200/403 (mesmo contrato do metaWebhook).

export interface TwilioSignatureArgs {
  /** URL completa do webhook como a Twilio a conhece. */
  url: string;
  /** Parâmetros do POST form-urlencoded (todos os campos). */
  params: Record<string, string>;
  /** Valor do header X-Twilio-Signature (Base64). */
  signatureHeader: string | null | undefined;
  /** Auth Token da conta Twilio. */
  authToken: string | null | undefined;
}

export async function verifyTwilioSignature(
  args: TwilioSignatureArgs,
): Promise<boolean> {
  const { url, params, signatureHeader, authToken } = args;
  if (!signatureHeader || !authToken || !url) return false;

  const provided = signatureHeader.trim();
  if (provided.length === 0) return false;

  let expected: string;
  try {
    expected = await computeTwilioSignature(url, params, authToken);
  } catch {
    return false;
  }

  return timingSafeEqualStr(expected, provided);
}

/**
 * Computa a assinatura esperada (Base64 de HMAC-SHA1). Exportada
 * separada pra permitir known-answer tests contra o vetor da
 * documentação da Twilio.
 */
export async function computeTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
): Promise<string> {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bufToBase64(sigBuf);
}

/**
 * Resolve a URL que entra no cálculo da assinatura. A URL canônica vem
 * de configuração (`TWILIO_WEBHOOK_URL`) porque atrás de proxy o
 * `req.url` visto pela função pode divergir (esquema/host) da URL que a
 * Twilio assinou. Sem configuração, usa a URL da request como fallback
 * documentado.
 */
export function resolveTwilioWebhookUrl(
  configuredUrl: string | null | undefined,
  requestUrl: string,
): string {
  const configured = configuredUrl?.trim();
  return configured && configured.length > 0 ? configured : requestUrl;
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Comparação em tempo constante — não vaza tamanho/posição do primeiro
 * byte divergente via early-return.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
