
# Sprint 6: Marketing IA - Plano de Implementacao Completo

## Visao Geral

Implementar o modulo completo de Marketing IA em 3 fases, evoluindo os componentes skeleton existentes (ConversationManager, AIAgentConfig, SequenceBuilder) para versoes completas com integracao real ao Lovable AI Gateway.

---

## Fase 6.1: Conversas AI - Layout Completo + Edge Function

### Database: Migracoes necessarias

1. Adicionar colunas faltantes nas tabelas existentes:
   - `conversations`: adicionar `channel` (text, default 'whatsapp'), `context` (jsonb, default '{}'), `taken_over_by` (uuid, nullable), `taken_over_at` (timestamptz, nullable)
   - `conversation_messages`: adicionar `metadata` (jsonb, default '{}')

2. Criar tabela `ai_conversation_logs` para tracking de custo/uso:
   - `id` uuid PK
   - `conversation_id` uuid FK
   - `model` text
   - `input_tokens` int
   - `output_tokens` int
   - `cost_cents` int
   - `created_at` timestamptz

3. Habilitar Realtime na tabela `conversation_messages` para atualizacao em tempo real do chat.

4. RLS para `ai_conversation_logs`: admin full, reception select.

### Edge Function: `process-conversation-message`

- Recebe `conversation_id` e `message` (do usuario/lead)
- Busca o agente ativo em `ai_agent_config`
- Carrega historico de mensagens da conversa
- Carrega dados do lead vinculado (nome, status, score, tags)
- Monta o system prompt com context do lead
- Chama o Lovable AI Gateway (streaming desabilitado para simplicidade inicial)
- Salva a resposta como mensagem `role: 'assistant'`, `ai_generated: true`
- Registra log em `ai_conversation_logs`
- Verifica regras de handoff (se configuradas) e marca conversa como `needs_handoff` se necessario
- Retorna a resposta

### Frontend: ConversationManager refatorado

**Layout 3 colunas:**

- **Coluna esquerda (1/4)**: Lista de conversas com filtros por status/canal, avatar do lead, preview da ultima mensagem, badge de canal, timestamp relativo
- **Coluna central (2/4)**: Chat timeline com bolhas diferenciadas (user direita azul, assistant esquerda cinza, system centralizado), input de mensagem com botao enviar, toggle "Assumir Conversa" (Take Control), indicador de typing enquanto IA processa
- **Coluna direita (1/4)**: Painel de contexto do lead (nome, telefone, email, score, status pipeline, tags), acoes rapidas (Agendar Trial, Encerrar Conversa)

**Realtime**: Subscription no channel `conversation_messages` para mostrar respostas da IA sem refresh.

### Novos componentes:
- `src/components/marketing/ConversationList.tsx` - Lista lateral com filtros
- `src/components/marketing/ChatTimeline.tsx` - Timeline de mensagens
- `src/components/marketing/ChatInput.tsx` - Input com envio e takeover
- `src/components/marketing/LeadContextPanel.tsx` - Painel direito de contexto

### Hook:
- `src/hooks/useConversations.ts` - CRUD + realtime subscription + envio de mensagem via edge function

---

## Fase 6.2: Configuracao do AI Agent - Versao Completa

### Database: Migracoes

1. Adicionar colunas em `ai_agent_config`:
   - `knowledge_base` (jsonb, default '{}') - Base de conhecimento estruturada
   - `handoff_rules` (jsonb, default '[]') - Regras de transferencia para humano
   - `behavior_config` (jsonb, default '{}') - Configuracoes de comportamento (auto-respond, delay, max messages, etc.)

### Frontend: AIAgentConfig refatorado

Organizar em abas (Tabs):

1. **System Prompt**: Textarea grande, lista de variaveis disponiveis ({studio_name}, {lead.name}, etc.), botao "Testar Prompt" que abre dialog simulando conversa
2. **Knowledge Base**: Formulario estruturado para dados do studio (nome, coordenador, modalidades, duracao sessao, faixa etaria, horarios), salva como JSON
3. **Comportamento**: Toggles (auto-respond, human timing simulation, auto-schedule trials), Sliders (delay min/max, max messages before handoff, qualification threshold)
4. **Handoff Rules**: Lista de checkboxes (insiste em preco, pede desconto, questoes clinicas, alta intencao), campo de regex customizado para palavras-chave, template de mensagem ao transferir
5. **Custo e Uso**: Cards com total gasto no mes, total mensagens processadas, custo medio por conversa (dados de `ai_conversation_logs`), grafico de uso diario (Recharts)

### Hook:
- `src/hooks/useAIAgentConfig.ts` - CRUD completo com React Query

---

## Fase 6.3: Sequencias de Nurturing - Visual Builder

### Database: Migracoes

1. Adicionar colunas em `sequence_steps`:
   - `channel` (text, default 'whatsapp') - Canal de envio
   - `condition` (jsonb, nullable) - Condicao para executar o step

2. Criar tabela `sequence_executions`:
   - `id` uuid PK
   - `sequence_id` uuid FK
   - `lead_id` uuid FK
   - `current_step` int
   - `status` text (running, completed, paused, failed)
   - `started_at` timestamptz
   - `completed_at` timestamptz nullable
   - `next_step_at` timestamptz nullable

3. Criar tabela `sequence_step_events`:
   - `id` uuid PK
   - `execution_id` uuid FK
   - `step_id` uuid FK
   - `event_type` text (sent, delivered, opened, clicked, failed)
   - `created_at` timestamptz

4. RLS: admin full access em ambas, reception select.

### Edge Function: `execute-nurturing-step`

- Busca execucoes com `next_step_at <= now()` e status `running`
- Para cada execucao, busca o step correspondente
- Substitui variaveis no template ({{lead.name}}, {{trial.date}}, etc.)
- Envia via canal configurado (whatsapp via `send-whatsapp` existente, ou email futuro)
- Registra evento em `sequence_step_events`
- Atualiza `current_step` e calcula `next_step_at`
- Se ultimo step, marca como `completed`

### Frontend: SequenceBuilder refatorado

- **Lista**: Cards de sequencias com nome, trigger, numero de steps, status (active/paused), taxa de abertura/conversao (quando houver dados)
- **Visual Builder**: Timeline vertical com cards para cada step, botao "+" entre steps para inserir novo, cada step mostra: numero, delay (ex: "2h apos anterior"), canal (badge whatsapp/email/sms), condicao (se houver), preview da mensagem, botoes editar/deletar
- **Editor de Step** (Dialog): Delay (input numerico + select horas/dias), canal (select), condicao opcional (dropdown: "Nao respondeu", "Nao agendou trial", etc.), editor de mensagem com suporte a variaveis ({{lead.name}}, {{trial.date}}), preview com dados de exemplo
- **Analytics por Sequencia**: Cards (enviados, abertos, cliques, conversoes), performance por step
- **Sequencias Pre-configuradas**: Botao "Criar a partir de Template" com opcoes: Instagram Captured, Post-Trial, Reengagement

### Novos componentes:
- `src/components/marketing/SequenceList.tsx` - Lista de sequencias
- `src/components/marketing/SequenceTimeline.tsx` - Visual builder vertical
- `src/components/marketing/StepEditor.tsx` - Dialog de edicao de step
- `src/components/marketing/SequenceAnalytics.tsx` - Analytics por sequencia

### Hook:
- `src/hooks/useNurturingSequences.ts` - CRUD sequencias + steps + executions

---

## Rota e Navegacao

Manter a rota atual `/marketing-ai` com abas (Conversas, Agente IA, Sequencias) conforme ja esta no `MarketingAI.tsx`. Nao criar rotas separadas.

---

## Resumo Tecnico de Arquivos

| Acao | Arquivo |
|------|---------|
| Nova edge function | `supabase/functions/process-conversation-message/index.ts` |
| Nova edge function | `supabase/functions/execute-nurturing-step/index.ts` |
| Atualizar config | `supabase/config.toml` (adicionar 2 functions) |
| Refatorar | `src/components/marketing/ConversationManager.tsx` |
| Refatorar | `src/components/marketing/AIAgentConfig.tsx` |
| Refatorar | `src/components/marketing/SequenceBuilder.tsx` |
| Novo componente | `src/components/marketing/ConversationList.tsx` |
| Novo componente | `src/components/marketing/ChatTimeline.tsx` |
| Novo componente | `src/components/marketing/ChatInput.tsx` |
| Novo componente | `src/components/marketing/LeadContextPanel.tsx` |
| Novo componente | `src/components/marketing/SequenceList.tsx` |
| Novo componente | `src/components/marketing/SequenceTimeline.tsx` |
| Novo componente | `src/components/marketing/StepEditor.tsx` |
| Novo componente | `src/components/marketing/SequenceAnalytics.tsx` |
| Novo hook | `src/hooks/useConversations.ts` |
| Novo hook | `src/hooks/useAIAgentConfig.ts` |
| Novo hook | `src/hooks/useNurturingSequences.ts` |
| Migracao SQL | Tabelas + colunas + RLS conforme descrito acima |

---

## Ordem de Implementacao

1. **Migracoes SQL** (todas de uma vez)
2. **Edge function `process-conversation-message`** + config.toml
3. **Fase 6.1** - ConversationManager completo com 3 colunas + hooks + realtime
4. **Fase 6.2** - AIAgentConfig completo com abas + knowledge base + handoff rules
5. **Edge function `execute-nurturing-step`**
6. **Fase 6.3** - SequenceBuilder completo com visual builder + analytics

Devido ao volume, a implementacao sera dividida em 3 mensagens sequenciais (uma por fase).
