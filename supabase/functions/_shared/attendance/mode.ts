// Modo efetivo de envio dos alertas de assiduidade.
//
// Existem duas fontes de modo:
//   * a policy `attendance_agent.mode`, que e o estado ATUAL do agente;
//   * `attendance_alerts.mode`, gravado na linha quando o alerta nasceu.
//
// Antes, cada caminho olhava uma delas isoladamente: o alerta novo respeitava
// a policy, mas o envio de pendentes e a escalacao decidiam so pelo `mode` da
// linha. Um alerta gravado como `live` continuava sendo entregue ao treinador
// mesmo com o agente ja em shadow — ou seja, shadow nao era freio de verdade,
// e um alerta antigo (inclusive criado por chamada com `forceMode:"live"`,
// quando isso era aceito) sobrevivia a decisao de parar.
//
// Regra unica, agora: shadow SEMPRE vence. A policy funciona como freio geral
// e o modo da linha so pode REDUZIR o efeito, nunca promove-lo. Isso e o mesmo
// princípio ja aplicado ao `forceMode` — reduzir alcance e seguro, ampliar nao.
//
// Enquanto a agenda do EVO estiver suja (presencas fantasma de agendamento
// recorrente, cadastros duplicados), shadow e a posicao segura e precisa valer
// para tudo que ainda nao saiu.

export type AttendanceMode = "shadow" | "live";

/**
 * Modo que de fato deve ser usado para entregar uma mensagem.
 *
 * `live` exige que a policy atual E o modo da linha sejam `live`. Qualquer
 * valor desconhecido ou ausente e tratado como `shadow` (fail-safe): na
 * duvida, a mensagem vai para o telefone de sombra, nao para a aluna.
 */
export function resolveEffectiveMode(
  policyMode: string | null | undefined,
  rowMode: string | null | undefined,
): AttendanceMode {
  return policyMode === "live" && rowMode === "live" ? "live" : "shadow";
}

/**
 * `true` quando a policy atual autoriza envio real.
 *
 * Util para curto-circuitar um lote inteiro sem percorrer linha a linha.
 */
export function policyAllowsLive(policyMode: string | null | undefined): boolean {
  return policyMode === "live";
}
