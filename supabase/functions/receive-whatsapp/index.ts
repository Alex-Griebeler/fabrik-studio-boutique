// Endpoint DESATIVADO — retorna 410 Gone para tudo.
//
// Histórico: este webhook recebia mensagens WhatsApp da Twilio (sandbox)
// e gravava em conversations/conversation_messages via service role, SEM
// validação de assinatura — qualquer POST anônimo da internet era aceito
// (achado da auditoria de 03/08/2026). Em 04/08 o Alex confirmou o fato
// de negócio que o código não contava: a assinatura da Twilio foi
// abandonada. O canal do app será um número exclusivo com WhatsApp
// Business API (Meta), ainda não ativado.
//
// Canal morto não se blinda, se lacra: nenhuma leitura de body, nenhum
// acesso a banco, nenhum secret. (PR #14, que blindava a assinatura
// Twilio, foi fechada como superseded.)
//
// Quando o canal Meta for ativado, o inbound entra por
// `receive-whatsapp-meta` (que já valida X-Hub-Signature-256) ou por
// função nova do projeto "ativar canal WhatsApp" — nunca por aqui.
// Nessa hora, o ideal é também REMOVER este deploy em vez de manter o
// 410 (o lacre existe porque undeploy não acontece via merge).

Deno.serve((req) => {
  console.log(
    `receive-whatsapp: endpoint desativado (canal Twilio abandonado) — 410 para ${req.method}`,
  );
  return new Response("Gone", { status: 410 });
});
