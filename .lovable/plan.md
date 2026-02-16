

# Plano Completo - Modulo Financeiro Fabrik Studio

## Resumo Executivo

Este plano implementa as melhorias do modulo financeiro conforme o documento de especificacao, organizadas em 4 fases. O foco e tornar o sistema mais completo, com geracao automatica de faturas, controle de taxas da Rede, tabela de fornecedores, contas bancarias e auditoria financeira.

---

## Fase 1 - Infraestrutura de Dados (banco de dados)

### 1.1 Tabela `bank_accounts`
Registrar contas bancarias do studio para rastrear saldos e facilitar a conciliacao.

Campos principais:
- `id`, `name` (ex: "Itau Conta Corrente"), `bank_code`, `branch`, `account_number`
- `pix_key`, `is_active`, `current_balance_cents`
- Vincular `bank_imports.account_id` a esta tabela

### 1.2 Tabela `suppliers` (Fornecedores)
Cadastro de fornecedores para vincular a despesas.

Campos principais:
- `id`, `name`, `legal_name`, `cnpj`, `email`, `phone`
- `pix_key`, `bank_name`, `bank_branch`, `bank_account`
- `payment_terms`, `contact_name`, `notes`, `is_active`

### 1.3 Novos campos na tabela `invoices`
- `invoice_number` (texto, ex: FAT-2025-00001) -- numeracao sequencial
- `fine_amount_cents` (multa por atraso)
- `interest_amount_cents` (juros por atraso)
- `competence_date` (data de competencia, separada do vencimento)

### 1.4 Novos campos na tabela `expenses`
- `supplier_id` (FK para suppliers)
- `competence_date` (data de competencia)
- `is_recurring` + `recurring_frequency` + `recurring_until` + `parent_expense_id`

### 1.5 Tabela `audit_log`
Rastrear alteracoes em registros financeiros.

Campos: `id`, `table_name`, `record_id`, `action` (insert/update/delete), `old_data` (jsonb), `new_data` (jsonb), `changed_by`, `changed_at`

Triggers automaticos nas tabelas: `invoices`, `expenses`, `contracts`, `bank_transactions`

### 1.6 Indices de performance
Criar indices nas colunas mais consultadas: `invoices(due_date, status, student_id)`, `expenses(due_date, status, category_id)`

### 1.7 RLS
- `bank_accounts`: admin full, manager select
- `suppliers`: admin full, manager/reception select
- `audit_log`: admin select only

---

## Fase 2 - Geracao Automatica de Faturas e Penalidades

### 2.1 Edge Function `generate-monthly-invoices`
- Executada via Cron no dia 1 de cada mes
- Busca contratos ativos e gera faturas com `invoice_number` sequencial
- Calcula valor liquido (mensal - desconto)
- Usa `payment_day` do contrato como dia de vencimento
- Verifica duplicidade por `contract_id` + `competence_date`

### 2.2 Edge Function `calculate-invoice-penalties`
- Executada diariamente via Cron
- Busca faturas pendentes vencidas
- Aplica multa de 2% (uma vez) e juros de 0,033%/dia (max 1%)
- Atualiza status para `overdue` automaticamente
- Regras configuraveis via tabela `policies`

### 2.3 Geracao de Despesas Recorrentes
- Na mesma Edge Function ou separada
- Busca despesas com `is_recurring = true` e gera copias mensais

---

## Fase 3 - Conciliacao Bancaria Aprimorada

### 3.1 Identificacao de transacoes da Rede (Itau)
- No `parse-bank-statement`: detectar linhas com "REDE" ou "REDECARD" no memo
- Marcar `parsed_type = 'card_processor'` e `parsed_name = 'REDE'`
- No `match-bank-transactions`: tratamento especial para transacoes da Rede

### 3.2 Controle de Taxas da Rede
- Nova categoria de despesa automatica: "Taxas Maquininha Rede"
- Quando o valor creditado da Rede e menor que a fatura do aluno, a diferenca e registrada como despesa (taxa)
- Campo `processor_fee_cents` na tabela `bank_transactions` para registrar a taxa identificada

### 3.3 Matching por valor aproximado
- Implementar tolerancia de +/- R$ 0,50 no matching de valores
- Util para diferenca de centavos em arredondamentos bancarios

### 3.4 Desvincular Match (Undo)
- Botao "Desvincular" nas transacoes ja conciliadas
- Usa o hook `useRejectMatch` que ja existe, mas nao esta exposto na UI

### 3.5 Deletar/Reprocessar Importacao
- Botao para excluir uma importacao e todas suas transacoes
- Confirmacao com AlertDialog

### 3.6 KPIs aprimorados
- Percentual de conciliacao (matched / total)
- Valor total conciliado vs. pendente
- Score medio de confianca dos matches

---

## Fase 4 - Interface e Integracao

### 4.1 Cadastro de Fornecedores
- Nova pagina ou aba em Despesas para gerenciar fornecedores
- Formulario com campos do supplier (nome, CNPJ, PIX, banco)
- Select de fornecedor no formulario de despesa

### 4.2 Cadastro de Contas Bancarias
- Aba em Configuracoes ou no modulo financeiro
- Permite registrar contas do studio
- Selecao de conta ao importar extrato

### 4.3 Melhorias na tela de Faturas
- Exibir numero sequencial da fatura
- Coluna de "dias em atraso" para faturas vencidas
- Filtros avancados: por aluno, periodo, forma de pagamento
- Exibir multa e juros calculados

### 4.4 Fluxo de Caixa (melhoria futura)
- Separacao entre realizado e previsto
- Grafico de saldo acumulado projetado
- Visao diaria/semanal/mensal

---

## Detalhes Tecnicos

### Sequencia de Implementacao
1. Migrations de banco (tabelas, campos, indices, triggers)
2. Edge Functions (geracao de faturas, penalidades)
3. Cron jobs (agendamento das Edge Functions)
4. Hooks e componentes frontend
5. Atualizacao da UI existente

### Cron Jobs necessarios
- `generate-monthly-invoices`: `0 3 1 * *` (dia 1, 03h)
- `calculate-invoice-penalties`: `0 4 * * *` (diariamente, 04h)

### Arquivos principais a criar/modificar
- **Criar:** `supabase/functions/generate-monthly-invoices/index.ts`
- **Criar:** `supabase/functions/calculate-invoice-penalties/index.ts`
- **Criar:** `src/hooks/useSuppliers.ts`
- **Criar:** `src/hooks/useBankAccounts.ts`
- **Criar:** `src/components/finance/SupplierFormDialog.tsx`
- **Criar:** `src/components/finance/BankAccountManager.tsx`
- **Modificar:** `supabase/functions/match-bank-transactions/index.ts` (tolerancia, Rede)
- **Modificar:** `supabase/functions/parse-bank-statement/index.ts` (deteccao Rede)
- **Modificar:** `src/hooks/useInvoices.ts` (novos campos)
- **Modificar:** `src/hooks/useExpenses.ts` (supplier_id, recorrencia)
- **Modificar:** `src/pages/BankReconciliation.tsx` (KPIs, undo, delete import)
- **Modificar:** `src/pages/Finance.tsx` (nova aba fornecedores)
- **Modificar:** `src/components/finance/InvoiceFormDialog.tsx` (novos campos)
- **Modificar:** `src/components/finance/ExpenseFormDialog.tsx` (supplier select)

### Estimativa de complexidade
- Fase 1 (Banco): Media - varias migrations mas sem logica complexa
- Fase 2 (Edge Functions): Alta - logica de negocios critica
- Fase 3 (Conciliacao): Media - ajustes na Edge Function existente
- Fase 4 (Interface): Media - componentes seguindo padrao existente

