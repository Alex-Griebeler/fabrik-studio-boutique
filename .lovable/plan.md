

# Plano de Implementacao -- Gaps Identificados (FABRIK)

## Analise de Status Atual

Apos cruzar o documento de gaps com o sistema existente, muitos itens ja foram implementados. Abaixo o resumo:

| Modulo | Status | Detalhe |
|--------|--------|---------|
| CRM & Leads | Implementado | Tabela `leads`, Kanban, formulario, interacoes, trial scheduling, conversao |
| Financeiro (Contratos/Faturas) | Implementado | Contratos, faturas, despesas, categorias, conciliacao bancaria, NF-e |
| Funil de Conversao | Implementado | Pipeline Kanban + aba Conversao no Analytics |
| Experimentais | Implementado | TrialScheduler com quotas e waitlist |
| Dashboard | Implementado | KPIs basicos (faturamento, alunos, inadimplencia, ocupacao) |
| Analytics | Implementado | Conversao, Operacoes, Financeiro com filtro de periodo |
| **Consultores & Comissoes** | **NAO IMPLEMENTADO** | Sem comissoes, sem metas, sem atribuicao de consultor |
| **Tarefas & Follow-up** | **NAO IMPLEMENTADO** | Sem sistema de tarefas automaticas |
| **KPIs Mensais Consolidados** | **NAO IMPLEMENTADO** | Sem snapshot mensal comparativo |
| **Campos extras no Lead** | **PARCIAL** | Falta `temperatura` (quente/morno/frio) e `consultor_id` |

---

## O que sera implementado (3 fases)

### FASE 1 -- Consultores & Comissoes (Prioridade Alta)

**1.1 Migration SQL**

Criar tabela `commissions`:
- id, profile_id (FK profiles), competencia (date), tipo (venda_nova/renovacao/indicacao/meta)
- contract_id (FK contracts), lead_id (FK leads)
- valor_base_cents, percentual_comissao, valor_comissao_cents
- status (calculada/aprovada/paga/cancelada), data_pagamento
- RLS: admin full CRUD, usuario ve apenas as proprias

Criar tabela `sales_targets` (metas):
- id, profile_id (FK profiles), competencia (date, unique com profile_id)
- meta_leads, meta_experimentais, meta_conversoes, meta_faturamento_cents
- realizado_leads, realizado_experimentais, realizado_conversoes, realizado_faturamento_cents
- bonus_cents, meta_batida (boolean)
- RLS: admin full CRUD, usuario ve apenas as proprias

Adicionar campos na tabela `leads`:
- `temperature` text (hot/warm/cold)
- `consultant_id` uuid (FK profiles)

Adicionar campo na tabela `profiles`:
- `commission_rate_pct` numeric DEFAULT 10

**1.2 Hooks**
- `src/hooks/useCommissions.ts` -- CRUD de comissoes, calculo automatico ao converter lead
- `src/hooks/useSalesTargets.ts` -- CRUD de metas mensais, calculo de atingimento

**1.3 Frontend**
- `src/pages/Commissions.tsx` -- Pagina com lista de comissoes por periodo, filtro por consultor, KPIs (total gerado, total pago, total pendente)
- `src/components/commissions/CommissionFormDialog.tsx` -- Formulario para registrar/editar comissao
- `src/components/commissions/SalesTargetManager.tsx` -- Configuracao de metas por consultor/mes
- Rota `/commissions` no App.tsx + item no sidebar

**1.4 Atualizacoes no CRM**
- Adicionar campo "Consultor" (select de profiles) no `LeadFormDialog`
- Adicionar campo "Temperatura" (hot/warm/cold) no `LeadFormDialog` e no `LeadKanban` (badge colorido)
- Ao converter lead, auto-criar registro de comissao para o consultor atribuido

---

### FASE 2 -- Tarefas & Follow-up (Prioridade Alta) ✅ COMPLETA

**2.1 Migration SQL**

Criar tabela `tasks`:
- id, tipo (ligar/whatsapp/email/seguir_experimental/fechar_venda/outro)
- lead_id (FK leads, nullable), student_id (FK students, nullable)
- assignee_id (uuid FK profiles) NOT NULL
- titulo, descricao, data_prevista (timestamptz), prioridade (baixa/media/alta/urgente)
- status (pendente/em_andamento/concluida/cancelada), data_conclusao, resultado
- RLS: admin full CRUD, usuario ve/edita apenas as proprias

Criar trigger: ao inserir lead, auto-criar tarefa "Primeiro contato" atribuida ao consultant_id do lead (se existir).

**2.2 Hooks**
- `src/hooks/useTasks.ts` -- CRUD de tarefas, filtros (status, prioridade, responsavel, atrasadas)

**2.3 Frontend**
- `src/pages/Tasks.tsx` -- Lista de tarefas com filtros, KPIs (pendentes, atrasadas, concluidas hoje)
- `src/components/tasks/TaskFormDialog.tsx` -- Formulario de criacao/edicao
- `src/components/tasks/TaskList.tsx` -- Lista com badges de prioridade e indicador de atraso
- Rota `/tasks` no App.tsx + item no sidebar
- Adicionar card "Tarefas Pendentes" no Dashboard principal

---

### FASE 3 -- KPIs Mensais Consolidados (Prioridade Media)

**3.1 Migration SQL**

Criar tabela `monthly_kpis`:
- competencia (date PK), total_leads, leads_marketing, leads_indicacao, leads_resgate
- total_experimentais, total_conversoes, conversoes_indicacao, conversoes_marketing
- taxa_conversao_leads, taxa_conversao_experimentais
- planos_para_renovar, renovacoes_efetivas, taxa_renovacao
- cancelamentos, taxa_churn
- faturamento_cents, despesas_cents, resultado_cents, margem_lucro_pct
- total_alunos, alunos_novos, alunos_perdidos
- calculado_em (timestamptz)
- RLS: admin SELECT/INSERT/UPDATE

Criar funcao SQL `calculate_monthly_kpis(p_date)` que calcula todos os KPIs a partir das tabelas existentes (leads, contracts, invoices, expenses, students).

**3.2 Hooks**
- `src/hooks/useMonthlyKPIs.ts` -- Buscar KPIs, disparar recalculo, comparativo mes a mes

**3.3 Frontend**
- Adicionar aba "KPIs Mensais" na pagina Analytics com:
  - Tabela comparativa mes a mes (como a planilha original)
  - Indicadores de variacao (setas verde/vermelho)
  - Botao "Recalcular" para forcar atualizacao

---

## Resumo de Arquivos

| Arquivo | Acao |
|--------|------|
| `supabase/migrations/..._commissions_tasks_kpis.sql` | Criar (migration completa) |
| `src/hooks/useCommissions.ts` | Criar |
| `src/hooks/useSalesTargets.ts` | Criar |
| `src/hooks/useTasks.ts` | Criar |
| `src/hooks/useMonthlyKPIs.ts` | Criar |
| `src/pages/Commissions.tsx` | Criar |
| `src/pages/Tasks.tsx` | Criar |
| `src/components/commissions/CommissionFormDialog.tsx` | Criar |
| `src/components/commissions/SalesTargetManager.tsx` | Criar |
| `src/components/tasks/TaskFormDialog.tsx` | Criar |
| `src/components/tasks/TaskList.tsx` | ✅ Criar |
| `src/components/leads/LeadFormDialog.tsx` | Refatorar (adicionar consultor + temperatura) |
| `src/components/leads/LeadKanban.tsx` | Refatorar (badge de temperatura) |
| `src/hooks/useLeads.ts` | Refatorar (converter auto-comissiona) |
| `src/pages/Dashboard.tsx` | Refatorar (card de tarefas pendentes) |
| `src/hooks/useAnalytics.ts` | Refatorar (aba KPIs mensais) |
| `src/components/analytics/KPIsTab.tsx` | Criar |
| `src/pages/Analytics.tsx` | Refatorar (nova aba) |
| `src/App.tsx` | Refatorar (rotas /commissions e /tasks) |
| `src/components/layouts/AppSidebar.tsx` | Refatorar (novos itens) |

Total: 20 arquivos (11 novos, 9 refatorados)

---

## Ordem de Execucao

1. Migration SQL (todas as tabelas + trigger + funcao KPI)
2. Fase 1: Hooks de comissoes/metas + campos extras no lead
3. Fase 1: Pagina Comissoes + formularios + sidebar
4. Fase 1: Atualizar LeadForm (consultor, temperatura) + auto-comissao na conversao
5. Fase 2: Hook de tarefas + trigger auto-tarefa
6. Fase 2: Pagina Tarefas + formulario + sidebar + card no Dashboard
7. Fase 3: Hook KPIs mensais + aba no Analytics

