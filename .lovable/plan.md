

# Sprint 5-6: Sistema de Sessoes e Treinadores

## Impacto e Refatoracao Necessaria

O sistema atual tem uma agenda simplificada (`class_sessions`, `class_templates`, `class_modalities`, `class_bookings`) que nao corresponde ao modelo do plano. O plano exige que **sessions** seja a fonte unica da verdade financeira -- cada sessao carrega o snapshot da taxa do treinador, status de pagamento, check-in e auditoria.

### O que muda:
1. **Tabela `class_sessions` atual** sera substituida pela nova `sessions` (modelo completo do plano)
2. **Tabela `trainers`** sera criada com taxas individuais (hourly, per_session, hybrid)
3. **Tabela `policies`** sera criada para regras configuraveis (cutoff de cancelamento, tolerancia de atraso, etc.)
4. **Tabela `makeup_credits`** sera criada para creditos de reposicao
5. Os hooks e componentes de agenda (`useSchedule`, `useSessions`, `WeeklyCalendar`, `SessionCard`, etc.) serao **reescritos** para usar o novo modelo

### O que se mantem:
- `class_modalities` e `class_templates` continuam uteis como auxiliares de agendamento
- Layout geral da agenda (calendario semanal, lista diaria)
- Paginas e rotas existentes

---

## Fase 1: Banco de Dados (Migrations)

### 1.1 Criar tabela `policies`
- Configuracoes customizaveis do sistema (cutoff de cancelamento, tolerancia, taxas padrao, etc.)
- Seed com valores iniciais conforme o plano

### 1.2 Criar tabela `trainers`
- Dados pessoais, especialidades, certificacoes
- **Taxas individuais**: `hourly_rate_main`, `hourly_rate_assistant`, `session_rate`
- Metodo de pagamento (`hourly`, `per_session`, `hybrid`)
- Dados bancarios, PIX
- RLS para admin

### 1.3 Criar tabela `sessions` (nova, fonte unica da verdade)
- Tipo (personal/group), aluno, contrato, treinador principal + assistente
- Agendamento (data, horarios, duracao)
- **Valores calculados** (snapshot da taxa, horas, valor final)
- **Status completo**: scheduled, cancelled_on_time, cancelled_late, no_show, completed, disputed, adjusted, late_arrival
- Campos de check-in (treinador e aluno, com timestamp, metodo, localizacao)
- Campos de cancelamento (timestamp, razao, within_cutoff)
- Campos de contestacao e auditoria anti-fraude
- Indices otimizados para folha de pagamento e auditoria
- RLS policies

### 1.4 Criar tabela `makeup_credits`
- Creditos de reposicao vinculados a sessao cancelada no prazo
- Status: available, used, expired
- Validade configuravel (fim do contrato ou dias fixos)
- Trigger para expirar automaticamente

### 1.5 Criar view `payable_sessions`
- View helper para calculo de folha de pagamento (Sprint 7)

### 1.6 Migrar dados existentes
- Se houver dados em `class_sessions`, migrar para o novo formato
- Manter tabelas antigas temporariamente para nao perder dados

---

## Fase 2: Backend - Hooks e Logica de Negocio

### 2.1 `src/hooks/useTrainers.ts` (refatorar)
- CRUD completo de treinadores usando a nova tabela `trainers`
- Busca por especialidade, status ativo

### 2.2 `src/hooks/usePolicies.ts` (novo)
- Helper `getPolicy<T>(key)` para buscar configuracoes
- `updatePolicy(key, value)` para alterar regras
- Cache com React Query

### 2.3 `src/hooks/useSessions.ts` (reescrever)
- **Criar sessao personal**: buscar taxa do treinador, calcular valor, criar com status `scheduled`
- **Cancelar sessao**: verificar cutoff via policies, determinar `cancelled_on_time` vs `cancelled_late`, criar makeup_credit se no prazo
- **Check-in**: registrar presenca de treinador e aluno com timestamp
- **Completar sessao**: marcar como `completed`
- Queries filtradas por data, treinador, aluno, status

### 2.4 `src/hooks/useMakeupCredits.ts` (novo)
- Listar creditos disponiveis por aluno
- Usar credito ao agendar reposicao

---

## Fase 3: Frontend - Componentes

### 3.1 Pagina de Treinadores (`/instructors` -> refatorar)
- Atualmente usa a tabela `profiles` de forma limitada
- Refatorar para usar `trainers` com campos completos
- Formulario com taxas, especialidades, dados bancarios
- Lista com filtros

### 3.2 Agenda (`/schedule` -> refatorar)
- `WeeklyCalendar` e `DailyList`: usar nova tabela `sessions`
- `SessionCard`: exibir status completo com cores, icone de check-in
- `SessionFormDialog`: formulario de criacao com selecao de treinador, calculo automatico de taxa
- `SessionDetailPopover`: detalhes completos, botoes de check-in, cancelamento

### 3.3 Novos componentes
- **CancelSessionDialog**: confirmacao com aviso de cutoff, razao obrigatoria
- **CheckInButton**: registrar presenca com timestamp
- **SessionStatusBadge**: badge colorido por status

### 3.4 Pagina de Configuracoes (`/settings` -> expandir)
- Aba "Politicas" para editar regras de negocio (cutoff, tolerancia, etc.)

---

## Secao Tecnica

### Modelo de dados simplificado

```text
policies (config)
    |
trainers (taxas)-------+
    |                   |
    +----> sessions <---+--- students
              |              contracts
              |
         makeup_credits
```

### Calculo de taxa ao criar sessao

```text
1. Buscar trainer.hourly_rate_main
2. duration_minutes = diff(end_time - start_time)
3. payment_hours = duration_minutes / 60
4. payment_amount = payment_hours * hourly_rate
5. Salvar snapshot na sessao (imutavel)
```

### Logica de cancelamento

```text
1. Buscar policy: personal_cancellation_cutoff_hours (ex: 12h)
2. hours_until = session_start - now
3. Se hours_until >= cutoff -> cancelled_on_time (nao paga treinador, gera credito)
4. Se hours_until < cutoff -> cancelled_late (paga treinador, sem credito)
```

### Ordem de execucao
1. Migrations (tabelas + seeds + view)
2. Hooks (useTrainers, usePolicies, useSessions, useMakeupCredits)
3. Componentes de agenda (refatorar para novo modelo)
4. Pagina de treinadores (refatorar)
5. Configuracoes de politicas (expandir settings)

