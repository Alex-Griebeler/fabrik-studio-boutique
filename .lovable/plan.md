

# Plano: Adicionar funcionalidade de excluir importação bancária

## Problema
Não existe botão para apagar uma importação de extrato bancário feita por engano. O usuário precisa poder excluir a importação e todas as transações associadas.

## Implementação

### 1. Hook: `useDeleteBankImport` em `useBankReconciliation.ts`

Adicionar uma nova mutation que:
- Deleta todas as `bank_transactions` com o `import_id` correspondente
- Deleta o registro de `bank_imports`
- Invalida as queries de imports e transactions

### 2. UI: Botão de excluir em `BankReconciliation.tsx`

Adicionar um botão com ícone de lixeira (Trash2) ao lado do seletor de importações, com um AlertDialog de confirmação para evitar exclusões acidentais. O dialog dirá algo como "Tem certeza que deseja excluir esta importação? Todas as transações serão removidas permanentemente."

Ao confirmar, reseta o `selectedImport` para null e limpa as sugestões de match.

### Arquivos a modificar
- `src/hooks/useBankReconciliation.ts` — nova mutation `useDeleteBankImport`
- `src/pages/BankReconciliation.tsx` — botão de excluir + AlertDialog de confirmação

