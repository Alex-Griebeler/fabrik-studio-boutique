
# Auditoria Completa do Projeto Fabrik

## Resumo Executivo

Foram analisados todos os modulos do sistema: Marketing IA, Leads, Financeiro, Agenda, Tarefas, Dashboard, Edge Functions, Autenticacao, RLS e arquitetura geral. A seguir, cada problema encontrado esta categorizado por severidade.

---

## BUGS CRITICOS (Impedem funcionamento correto)

### 1. SequenceBuilder nao usa forwardRef - causa warning no console
- **Arquivo**: `src/components/marketing/SequenceBuilder.tsx`
- **Problema**: O componente e passado como filho de `TabsContent` (que tenta injetar uma ref), mas nao usa `React.forwardRef`. Isso gera o warning visivel nos console logs.
- **Correcao**: Envolver o componente exportado com `React.forwardRef` ou, alternativamente, envolver o conteudo do `TabsContent` em um `<div>` wrapper na pagina `MarketingAI.tsx`.

### 2. useAIAgentConfig - setState durante render (race condition)
- **Arquivo**: `src/hooks/useAIAgentConfig.ts`, linhas 76-78
- **Problema**: O bloco `if (selectedAgent && Object.keys(editForm).length === 0) { setEditForm(selectedAgent); }` e executado diretamente no corpo do hook, causando um `setState` durante o render. Isso viola as regras do React e pode causar loops de re-render.
- **Correcao**: Mover essa logica para um `useEffect` com dependencia em `selectedAgent`.

### 3. useNurturingSequences e useAIAgentConfig - setState no queryFn
- **Arquivos**: `src/hooks/useNurturingSequences.ts` (linha 50), `src/hooks/useAIAgentConfig.ts` (linha 43)
- **Problema**: `setSelectedSeqId(data[0].id)` e `setSelectedAgentId(data[0].id)` sao chamados dentro do `queryFn`, que e executado pelo React Query e pode rodar fora do ciclo de render. Isso e um anti-pattern que pode causar warnings e comportamento imprevisivel.
- **Correcao**: Usar `onSuccess` do useQuery (via `select` + `useEffect`) ou extrair a logica de auto-selecao para um `useEffect` separado.

### 4. config.toml - Edge Functions sem registro
- **Arquivo**: `supabase/config.toml`
- **Problema**: As funcoes `match-bank-transactions` e `parse-bank-statement` existem no codigo mas nao estao registradas no `config.toml`. Sem a entrada `[functions.xxx]`, o comportamento de JWT pode ser o padrao (verify_jwt = true), potencialmente bloqueando chamadas legitimas que passam auth header manualmente.
- **Correcao**: Adicionar entradas `[functions.match-bank-transactions]` e `[functions.parse-bank-statement]` com `verify_jwt = false` (ambas ja validam auth no codigo).

---

## BUGS MODERADOS (Comportamento incorreto em cenarios especificos)

### 5. CORS headers inconsistentes entre Edge Functions
- **Arquivos**: `match-bank-transactions/index.ts` e `parse-bank-statement/index.ts`
- **Problema**: Os headers CORS dessas funcoes nao incluem os novos headers de plataforma (`x-supabase-client-platform`, etc.), enquanto as outras funcoes incluem. Isso pode causar falhas de CORS em navegadores quando o SDK do Supabase enviar esses headers.
- **Correcao**: Padronizar o bloco `corsHeaders` para incluir todos os headers necessarios.

### 6. process-conversation-message - variavel `messages` sombreia parametro
- **Arquivo**: `supabase/functions/process-conversation-message/index.ts`, linha 155
- **Problema**: A variavel `const messages = [...]` na linha 155 sombreia o parametro `message` da entrada (linha 57), mas pior: o array de `messages` inclui o `system prompt` + historico, sendo passado para a API. Isso funciona, mas o nome colide com o que seria esperado e pode causar confusao. Nao e um bug funcional, mas e um risco de manutencao.

### 7. Dashboard - referencia a campos inexistentes do lead
- **Arquivo**: `src/pages/Dashboard.tsx`, linhas 234, 246-249
- **Problema**: O `useRecentLeads` retorna leads com `lead_stage` mapeado de `status`, mas o Dashboard usa `leadStageLabels` com valores antigos (`trial`, `negotiation`) que nao correspondem ao enum atual do sistema (`new`, `contacted`, `qualified`, `trial_scheduled`, `converted`, `lost`). O fallback "Novo" mascara o problema, mas os labels e cores estao desincronizados.
- **Correcao**: Usar os mesmos `leadStatusLabels` e `leadStatusColors` de `useLeads.ts`.

### 8. Anamnese - formulario publico sem rate limiting
- **Arquivo**: `src/pages/Anamnese.tsx`
- **Problema**: A rota `/anamnese/:leadId` e publica (sem `ProtectedRoute`) e chama `supabase.rpc("update_lead_anamnese")` diretamente. A funcao RPC e `SECURITY DEFINER`, mas qualquer pessoa com um `lead_id` UUID pode submeter dados. Nao ha captcha, rate limiting ou validacao de que o lead existe antes da submissao.
- **Risco**: Baixo (UUIDs sao dificeis de adivinhar), mas e uma vulnerabilidade.

### 9. execute-nurturing-step - nao valida JWT
- **Arquivo**: `supabase/functions/execute-nurturing-step/index.ts`
- **Problema**: A funcao nao tem `verify_jwt = false` no config (ja tem) e tambem nao valida JWT no codigo. Ela usa `SUPABASE_SERVICE_ROLE_KEY` diretamente, o que e correto para uma funcao de cron/trigger, mas qualquer pessoa pode invoca-la via HTTP sem autenticacao.
- **Risco**: Medio - alguem poderia disparar execucoes de sequencias manualmente.
- **Correcao**: Adicionar validacao de JWT ou de uma chave de servico customizada, ou restringir o acesso via configuracao de rede.

---

## INCONSISTENCIAS E MELHORIAS

### 10. Tipagem `as any` remanescente
- **Arquivo**: `src/hooks/useAIAgentConfig.ts` (linhas 96-98)
- **Problema**: 3 usos de `as any[]` e `as Record<string, any>`. Viola o padrao de 100% TypeScript strict mencionado nas regras do projeto.
- **Correcao**: Criar interfaces tipadas para `knowledge_base`, `handoff_rules` e `behavior_config`.

### 11. Leaked Password Protection desativada
- **Fonte**: Linter do Supabase
- **Problema**: A protecao contra senhas vazadas esta desativada na configuracao de autenticacao.
- **Correcao**: Ativar nas configuracoes de autenticacao do backend.

### 12. ConversationManager - `deleteConversation` nao exposta
- **Arquivo**: `src/components/marketing/ConversationManager.tsx`
- **Problema**: O hook `useConversations` expoe `deleteConversation`, mas o componente `ConversationManager` nao o desestrutura nem o usa. Nao ha como o usuario deletar conversas pela interface.
- **Correcao**: Adicionar a acao de deletar na UI (por exemplo, via botao no header da conversa ou menu de contexto na lista).

### 13. ConversationList - `deleteConversation` prop ausente
- **Arquivo**: `src/components/marketing/ConversationList.tsx`
- **Problema**: O componente nao recebe nem implementa a acao de deletar conversas.

### 14. LeadContextPanel - dados limitados
- **Arquivo**: `src/components/marketing/LeadContextPanel.tsx`
- **Problema**: O painel nao mostra `source`, `qualification_details` (anamnese), nem permite editar dados do lead diretamente da tela de Marketing IA.

---

## FUNCIONALIDADES FALTANTES PARA 100%

### 15. WhatsApp bidirecional (webhook de entrada)
- **Status**: Incompleto
- **Problema**: O sistema envia mensagens via Twilio (`send-whatsapp`), mas nao tem um webhook para receber mensagens do lead. Toda comunicacao e iniciada manualmente pelo operador.
- **Necessidade**: Criar uma Edge Function `receive-whatsapp` que receba webhooks do Twilio, salve a mensagem como `role: "user"` na conversa e dispare a IA automaticamente.

### 16. Sequencias de nurturing - trigger automatico
- **Status**: Parcial
- **Problema**: As sequencias tem `trigger_status`, mas nao existe um trigger no banco ou cron job que inicie automaticamente uma execucao quando um lead muda de status. O `execute-nurturing-step` precisa ser invocado manualmente ou via cron externo.
- **Necessidade**: Criar um database trigger em `leads` ou um cron que verifique periodicamente.

### 17. Cron para execute-nurturing-step
- **Status**: Nao implementado
- **Problema**: A funcao `execute-nurturing-step` precisa ser chamada periodicamente para processar passos pendentes. Nao ha cron configurado.
- **Necessidade**: Configurar um pg_cron ou usar o Supabase pg_net para invocar a funcao periodicamente (a cada 5-15 minutos).

---

## PLANO DE CORRECAO (Ordem de prioridade)

| # | Item | Severidade | Esforco |
|---|------|-----------|---------|
| 1 | Fix setState durante render em useAIAgentConfig | Critico | Baixo |
| 2 | Fix setState no queryFn (useNurturingSequences, useAIAgentConfig) | Critico | Baixo |
| 3 | Fix forwardRef warning no SequenceBuilder | Critico | Baixo |
| 4 | Registrar funcoes faltantes no config.toml | Critico | Minimo |
| 5 | Padronizar CORS headers em todas as Edge Functions | Moderado | Baixo |
| 6 | Corrigir labels do Dashboard para usar leadStatusLabels | Moderado | Baixo |
| 7 | Adicionar validacao de auth no execute-nurturing-step | Moderado | Baixo |
| 8 | Remover `as any` e tipar corretamente | Baixo | Baixo |
| 9 | Ativar Leaked Password Protection | Baixo | Minimo |
| 10 | Expor deleteConversation na UI | Baixo | Baixo |
| 11 | Implementar webhook de entrada WhatsApp | Feature | Medio |
| 12 | Implementar trigger automatico de sequencias | Feature | Medio |
| 13 | Configurar cron para execute-nurturing-step | Feature | Baixo |

---

## Secao Tecnica Detalhada

### Fix #1 - useAIAgentConfig setState durante render
```text
Mover linhas 76-78 para:
useEffect(() => {
  if (selectedAgent && Object.keys(editForm).length === 0) {
    setEditForm(selectedAgent);
  }
}, [selectedAgent]);
```

### Fix #2 - setState no queryFn
```text
Remover setSelectedSeqId/setSelectedAgentId do queryFn.
Adicionar useEffect:
useEffect(() => {
  if (sequences.length > 0 && !selectedSeqId) {
    setSelectedSeqId(sequences[0].id);
  }
}, [sequences, selectedSeqId]);
```

### Fix #3 - SequenceBuilder forwardRef
```text
Solucao mais simples: Na pagina MarketingAI.tsx,
envolver <SequenceBuilder /> em <div>:
<TabsContent value="sequences">
  <div><SequenceBuilder /></div>
</TabsContent>
```

### Fix #4 - config.toml
```text
Adicionar:
[functions.match-bank-transactions]
verify_jwt = false

[functions.parse-bank-statement]
verify_jwt = false
```

### Fix #5 - CORS padronizado
```text
Usar em TODAS as funcoes:
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
```
