

# Auditoria Completa do Módulo Financeiro — Plano de Melhorias

Após analisar todos os arquivos do módulo financeiro (Conciliação, Despesas, Cobranças, Contratos), identifiquei bugs, falhas de UX e oportunidades de melhoria para tornar o sistema profissional e intuitivo.

---

## Bugs e Problemas Encontrados

### 1. Conciliação Bancaria
- **Bug: `__all__` não filtra is_balance_entry** — Na visão consolidada, entradas de saldo (saldos iniciais/finais do extrato) são incluídas nos KPIs e na lista, inflando créditos/débitos incorretamente.
- **Bug: Matching em visão consolidada** — Os botões "Buscar Vínculos" e "Vincular Automaticamente" só aparecem quando `activeImport` existe, mas ficam ocultos na visão consolidada (`__all__`), que é justamente onde seriam mais úteis.
- **Bug: `useBankTransactions` com `__all__` sem limit adequado** — O limit de 1000 pode não cobrir todos os extratos importados. Não há paginação.
- **Bug: KPI `kpis` tem lógica confusa** — A condição `!data.length && !transactions?.length` retorna zeros quando filteredTx está vazio mas transactions tem dados, gerando KPIs zerados ao aplicar filtros que excluem tudo.
- **UX: Sem feedback visual de qual importação está selecionada** após upload bem-sucedido (não auto-seleciona o novo arquivo).

### 2. Despesas (Expenses)
- **Bug: `as any` em `supplier`** — Na linha `(exp as any).supplier?.name` viola o padrão de zero `as any` documentado nas memórias de qualidade.
- **Bug: Formulário não inclui `competence_date`** — O campo existe na tabela mas nunca é preenchido pelo formulário, ficando sempre `null`.
- **Bug: Recorrência é salva mas nunca executada** — O campo `recurrence` e `is_recurring` existem mas não há lógica para gerar despesas futuras recorrentes.
- **UX: Sem filtro por fornecedor** no select de filtros da lista.
- **UX: Sem opção de excluir despesa** na tabela (o hook `useDeleteExpense` existe mas não é usado na UI).

### 3. Cobranças (Invoices)
- **Bug: Cobranças `overdue` não são detectadas automaticamente** — Não há cron/trigger que mude `pending` para `overdue` quando `due_date < now()`. O status depende de atualização manual.
- **Bug: `InvoicesTab` não tem filtro por período/mês** — Lista todas as cobranças de todos os tempos sem paginação temporal.
- **Bug: `InvoiceFormDialog` salva `payment_proof_url` com signed URL temporária** (1h) — Quando o link expira, o comprovante fica inacessível. Deveria salvar o `path` e gerar signed URLs on-demand.
- **UX: Sem indicador de multa/juros na tabela** — O valor exibido é só `amount_cents`, sem mostrar se há penalidades acumuladas.

### 4. Contratos
- **Bug: `monthly_value_cents` nunca é preenchido** no formulário — O contrato só preenche `total_value_cents`. O campo `monthly_value_cents` mostrado na tabela fica sempre vazio.
- **UX: Sem confirmação ao cancelar contrato** — O formulário de edição não oferece opção de cancelamento com motivo.

### 5. Matching (Edge Function)
- **Bug: `processor_fee_cents` é atualizado na tabela mas a coluna pode não existir** — Não encontrei essa coluna no schema de `bank_transactions`. Isso causaria erros silenciosos.
- **Bug: Ao auto-aplicar matches, `paid_amount_cents` não é preenchido nas invoices** — Apenas `status` e `payment_date` são atualizados, diferente do fluxo manual que inclui o valor pago.

---

## Plano de Implementação

### Fase 1 — Correções Críticas (bugs que afetam dados)

1. **Corrigir `payment_proof_url`**: Salvar apenas o `path` no banco, gerar signed URL no momento da visualização.
2. **Corrigir auto-match para incluir `paid_amount_cents`** na edge function.
3. **Remover todos os `as any`** do módulo de despesas.
4. **Adicionar campo `competence_date`** ao formulário de despesas.
5. **Corrigir KPI da conciliação** para filtrar `is_balance_entry` corretamente na visão consolidada.
6. **Auto-selecionar importação** após upload bem-sucedido.

### Fase 2 — Melhorias de UX/UI

7. **Adicionar filtro de período/mês nas Cobranças** (InvoicesTab) — navegação mensal como já existe em Despesas.
8. **Exibir multa/juros na tabela de cobranças** quando houver.
9. **Adicionar botão de excluir** na tabela de despesas.
10. **Habilitar matching na visão consolidada** da conciliação.
11. **Calcular e exibir `monthly_value_cents`** automaticamente ao criar contrato (total / parcelas).
12. **Adicionar filtro por fornecedor** na tela de despesas.

### Fase 3 — Funcionalidades Profissionais

13. **Criar trigger/cron para marcar cobranças como `overdue`** automaticamente quando `due_date < now()` e status = `pending`.
14. **Implementar geração automática de despesas recorrentes** (mensal/semanal/anual) via cron ou trigger.
15. **Adicionar paginação** nas listagens de transações bancárias (>1000 registros).

---

## Detalhes Técnicos

### Migração necessária (Fase 1)
```sql
-- Verificar/adicionar processor_fee_cents em bank_transactions
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS processor_fee_cents integer DEFAULT 0;
```

### Arquivos impactados
- `src/hooks/useInvoices.ts` — paid_amount_cents no update
- `src/hooks/useExpenses.ts` — remover as any, adicionar competence_date
- `src/hooks/useBankReconciliation.ts` — filtro is_balance_entry, auto-select
- `src/pages/BankReconciliation.tsx` — habilitar matching em __all__, auto-select
- `src/pages/Expenses.tsx` — botão excluir, filtro fornecedor
- `src/components/finance/InvoicesTab.tsx` — filtro mensal, coluna multa/juros
- `src/components/finance/InvoiceFormDialog.tsx` — salvar path em vez de signed URL
- `src/components/finance/ExpenseFormDialog.tsx` — campo competence_date
- `src/components/finance/ContractFormDialog.tsx` — calcular monthly_value_cents
- `supabase/functions/match-bank-transactions/index.ts` — paid_amount_cents

### Escopo estimado
- Fase 1: ~6 arquivos, 1 migração
- Fase 2: ~5 arquivos
- Fase 3: 2 migrações (cron overdue + recorrência), 1 edge function

