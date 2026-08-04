// Reconhecimento de chamada interna com service_role.
//
// Substitui sete copias de um `isServiceRoleJwt(token)` que decodificava o
// payload do JWT e confiava no campo `role`:
//
//     const payload = JSON.parse(atob(parts[1]...));
//     return payload?.role === "service_role";       // <- sem verificar assinatura
//
// A assinatura nunca era conferida, entao qualquer um montava offline um token
// com `{"role":"service_role"}` e assinatura arbitraria e era aceito como
// chamada interna — nas sete funcoes de atendimento, todas rodando com a chave
// de servico e portanto por fora de todo o RLS.
//
// O contrato correto ja existia ao lado do furo (`token === serviceKey`); o
// `||` com o decodificador e que o anulava. Aqui isso vira a unica forma
// aceita, com comparacao em tempo constante — mesmo criterio de
// `_shared/finance/logic.ts`, para nao vazar por latencia quantos caracteres
// da chave o atacante acertou.

/**
 * Comparacao em tempo constante entre dois textos.
 *
 * Percorre sempre o maior dos dois e incorpora a diferenca de tamanho no
 * acumulador, de modo que o tempo nao depende de onde esta a divergencia.
 */
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

/**
 * `true` somente quando o token E a chave de servico do projeto.
 *
 * Nao ha inspecao de conteudo: um JWT que apenas *afirma* ser service_role nao
 * passa. Token ou chave vazios sao sempre negados — senao um ambiente sem
 * `SUPABASE_SERVICE_ROLE_KEY` autorizaria requisicao sem credencial.
 */
export function isServiceRoleKey(
  token: string | null | undefined,
  serviceRoleKey: string | null | undefined,
): boolean {
  if (!token || !serviceRoleKey) return false;
  return timingSafeEqual(token, serviceRoleKey);
}

/** Extrai o token de um header `Authorization: Bearer <token>`. */
export function bearerToken(authHeader: string | null | undefined): string {
  if (!authHeader?.startsWith("Bearer ")) return "";
  return authHeader.slice("Bearer ".length).trim();
}
