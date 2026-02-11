

# CRM/Leads Completo -- Plano de Implementacao

## Objetivo

Criar uma tabela `leads` dedicada (separada de `students`) com qualification scoring, pipeline visual aprimorado, quotas de trial e formulario especifico -- conforme especificacao FABRIK.

Hoje os leads sao registros na tabela `students` com `status = 'lead'`. Isso sera substituido por uma entidade propria com campos de qualificacao, scoring, controle de trial e UTM tracking.

---

## Fase 1: Database -- Migration SQL

Criar 3 tabelas novas + alterar `interactions` + migrar dados existentes.

### 1.1 Tabela `leads`

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid PK | Identificador |
| name | text NOT NULL | Nome completo |
| email | text | Email |
| phone | text | Telefone |
| source | text | Origem (instagram, google, indicacao, etc.) |
| status | text DEFAULT 'new' | new, contacted, qualified, trial_scheduled, converted, lost |
| qualification_score | integer DEFAULT 0 | Score 0-100 |
| qualification_details | jsonb DEFAULT '{}' | Dados de qualificacao (objetivo, experiencia, etc.) |
| trial_date | date | Data do trial agendado |
| trial_time | text | Horario do trial |
| trial_type | text | group ou personal |
| converted_to_student_id | uuid FK students | Vinculo apos conversao |
| lost_reason | text | Motivo de perda |
| utm_params | jsonb | UTM tracking |
| tags | text[] DEFAULT '{}' | Tags livres |
| referred_by | uuid | Quem indicou |
| notes | text | Observacoes |
| created_at, updated_at | timestamptz | Timestamps |

### 1.2 Tabela `trial_quotas`

Controle de max 4 trials/dia e 1/hora.

| Coluna | Tipo |
|---|---|
| date | date PK |
| trials_booked | integer DEFAULT 0 |
| max_trials | integer DEFAULT 4 |
| occupied_hours | jsonb DEFAULT '[]' |

### 1.3 Tabela `trial_waitlist`

Fila de espera para trials.

| Coluna | Tipo |
|---|---|
| id | uuid PK |
| lead_id | uuid FK leads |
| preferred_dates | date[] |
| preferred_times | text[] |
| session_type_preference | text DEFAULT 'any' |
| position | integer |
| status | text DEFAULT 'waiting' |
| created_at | timestamptz |

### 1.4 Alterar tabela `interactions`

Adicionar coluna `lead_id` (uuid, nullable, FK leads) para que interacoes possam ser vinculadas tanto a students quanto a leads.

### 1.5 Migrar dados existentes

- Copiar registros de `students` onde `status = 'lead'` para a nova tabela `leads`
- Migrar interacoes associadas (preencher `lead_id` correspondente)
- NAO deletar registros antigos para preservar historico

### 1.6 RLS Policies

- Admin: acesso total (CRUD) em leads, trial_quotas, trial_waitlist
- Reception: SELECT e INSERT em leads e interactions
- Instructor: SELECT em leads

---

## Fase 2: Logica de Negocio -- Hooks

### 2.1 `src/lib/leadScoring.ts` (novo)

Funcao `calculateLeadScore(details)` que retorna score 0-100 e grade A/B/C/D:

```text
Criterio                     Pontos
---------------------------  ------
Idade 40-55                  +25
Executivo/Empresario         +25
Objetivo performance/saude   +20
Localizacao Brasilia/DF      +15
Budget premium               +10
Urgencia imediata            +5

Grade A: 75-100 | Grade B: 50-74 | Grade C: 25-49 | Grade D: 0-24
```

### 2.2 `src/hooks/useLeads.ts` (reescrever)

- `useLeads(filters)` -- query na tabela `leads` com filtros (status, source, score, busca)
- `useCreateLead()` -- insert com calculo automatico de score
- `useUpdateLead()` -- update com recalculo de score
- `useUpdateLeadStatus()` -- mover no pipeline
- `useConvertLead()` -- criar student a partir do lead, vincular `converted_to_student_id`
- `useInteractions(leadId)` -- adaptar para usar `lead_id`
- `useCreateInteraction()` -- adaptar para aceitar `lead_id`
- Manter tipos e constantes (InteractionType, labels, icons)

### 2.3 `src/hooks/useTrialQuotas.ts` (novo)

- `useTrialQuota(date)` -- buscar quota do dia
- `useCheckTrialAvailability()` -- verificar se data/hora esta disponivel
- `useBookTrial()` -- reservar slot, atualizar lead status para `trial_scheduled`

### 2.4 `src/hooks/useTrialWaitlist.ts` (novo)

- `useWaitlist()` -- listar fila
- `useAddToWaitlist()` -- adicionar lead a fila
- `useProcessWaitlist()` -- quando slot abre, notificar proximo

---

## Fase 3: Frontend -- Componentes

### 3.1 `LeadFormDialog.tsx` (novo, substitui StudentFormDialog para leads)

Formulario dedicado com campos:
- **Basico**: Nome, Email, Telefone, Source (select: instagram/google/indicacao/tiktok/facebook/whatsapp/site/outro)
- **Qualificacao**: Objetivo (select), Ja treinou antes? (sim/nao), Horario preferido, Profissao, Faixa etaria
- **Tags**: Multi-select livre
- Score calculado automaticamente ao salvar e exibido como badge

### 3.2 `LeadKanban.tsx` (refatorar)

Pipeline atualizado com 5 colunas ativas:

```text
New --> Contacted --> Qualified --> Trial Scheduled --> Converted
                                                        (Lost como filtro lateral)
```

Cards atualizados com:
- Badge de score (A verde, B azul, C amarelo, D vermelho)
- Source
- Tempo no stage atual
- Botoes de acao rapida (interacao, avancar)
- Drag-and-drop entre colunas

### 3.3 `LeadTable.tsx` (novo)

Vista em tabela com DataTable:
- Colunas: Nome, Email, Telefone, Source (badge), Score (badge colorido), Status, Ultima interacao (tempo relativo), Acoes (dropdown: editar, interacao, agendar trial, converter, marcar perdido)
- Filtros: status, source, faixa de score, busca por texto
- Ordenacao por colunas

### 3.4 `LeadDetailDialog.tsx` (refatorar)

- Score badge visual (A/B/C/D com cor)
- Qualification details formatados
- Dados de trial (data, tipo, status)
- Botao "Agendar Trial" com verificacao de quota
- Botao "Marcar como Perdido" com campo de motivo obrigatorio
- Timeline de interacoes usando `lead_id`

### 3.5 `TrialScheduler.tsx` (novo)

Componente para agendamento de trial:
- Selecionar data (calendario)
- Ver slots disponiveis (respeitando 4/dia e 1/hora)
- Selecionar tipo (group/personal)
- Ao confirmar: reserva slot na `trial_quotas`, atualiza lead para `trial_scheduled`

### 3.6 `InteractionFormDialog.tsx` (refatorar)

- Aceitar `leadId` alem de `studentId`
- Usar `lead_id` na insercao quando for contexto de leads

### 3.7 `Leads.tsx` (refatorar pagina)

- KPIs atualizados: Total, Qualificados (score >= 50), Trials Agendados, Taxa de Conversao
- Toggle Kanban / Tabela
- Filtros avancados colapsaveis

### 3.8 Navegacao

Nenhuma alteracao necessaria -- rota `/leads` ja existe no `App.tsx` e no sidebar.

---

## Resumo de Arquivos

| Arquivo | Acao |
|---|---|
| `supabase/migrations/..._leads_system.sql` | Criar (migration completa) |
| `src/lib/leadScoring.ts` | Criar |
| `src/hooks/useLeads.ts` | Reescrever |
| `src/hooks/useTrialQuotas.ts` | Criar |
| `src/hooks/useTrialWaitlist.ts` | Criar |
| `src/components/leads/LeadFormDialog.tsx` | Criar |
| `src/components/leads/LeadKanban.tsx` | Refatorar |
| `src/components/leads/LeadTable.tsx` | Criar |
| `src/components/leads/LeadDetailDialog.tsx` | Refatorar |
| `src/components/leads/TrialScheduler.tsx` | Criar |
| `src/components/leads/InteractionFormDialog.tsx` | Refatorar |
| `src/pages/Leads.tsx` | Refatorar |

Total: 12 arquivos (6 novos, 6 refatorados)

---

## Ordem de Execucao

1. Migration SQL (tabelas + seed + RLS + migracao de dados)
2. `leadScoring.ts` (funcao pura, sem dependencias)
3. `useLeads.ts` + `useTrialQuotas.ts` + `useTrialWaitlist.ts` (hooks)
4. `LeadFormDialog.tsx` + `TrialScheduler.tsx` (componentes novos)
5. `LeadKanban.tsx` + `LeadDetailDialog.tsx` + `InteractionFormDialog.tsx` (refatorar)
6. `LeadTable.tsx` (vista tabela nova)
7. `Leads.tsx` (pagina principal refatorada)

