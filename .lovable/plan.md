
# Reestruturar Sistema de Cobrancas - Modelo Real do Studio

## Resumo

Substituir o conceito de "faturas mensais automaticas" por **cobrancas geradas no momento da criacao do contrato**, com parcelas editaveis para DCC e PIX, e registro manual simplificado para Maquina da Rede e Dinheiro.

---

## Regras de Negocio por Forma de Pagamento

### 1. DCC (Debito Recorrente no Cartao)
- Ao criar contrato, gerar **N cobrancas** com status `scheduled`
- N = parcelas pre-preenchidas pela duracao do plano (anual=12, semestral=6, trimestral=3, mensal=1), **editavel**
- Valor de cada parcela = valor total liquido / N
- Datas: primeira na data de inicio, demais a cada 30 dias, **todas editaveis**
- Campos extras: ultimos 4 digitos do cartao, bandeira

### 2. Maquina da Rede (Cartao de Credito)
- Gerar **1 unica cobranca** com o valor total do plano
- Parcelamento e controlado pela maquina fisica, nao pelo sistema
- Numero de parcelas da maquina registrado apenas como informativo
- **Fluxo manual**: operador clica "Registrar Pagamento" apos passar na maquina
- **Fluxo automatico**: credito da Rede no extrato e conciliado automaticamente com essa cobranca

### 3. PIX
- Default: **1 cobranca** com o valor total
- **Editavel** para ate N parcelas (ex: plano anual em 3x)
- Se parcelado: datas em +0, +30, +60 dias a partir do inicio, **todas editaveis**
- Valor de cada parcela = valor total liquido / N

### 4. Dinheiro
- **1 cobranca** com o valor total
- Sem parcelamento

---

## Mudancas no Banco de Dados

### Migration: novos enums e campos

**Enums:**
- `payment_method`: adicionar `dcc` e `card_machine`
- `invoice_status`: adicionar `scheduled`

**Tabela `contracts` - novos campos:**
- `installments` (integer) -- numero de parcelas
- `total_paid_cents` (integer, default 0) -- valor total ja pago
- `card_last_four` (text) -- ultimos 4 digitos (DCC)
- `card_brand` (text) -- bandeira do cartao (DCC)

**Tabela `invoices` - novos campos:**
- `payment_type` (text) -- dcc, card_machine, pix, cash
- `installment_number` (integer) -- qual parcela (1, 2, 3...)
- `total_installments` (integer) -- total de parcelas
- `scheduled_date` (date) -- data programada para cobranca

---

## Frontend: ContractFormDialog (reescrita)

O formulario de contrato sera reorganizado com campos condicionais:

### Campos base (todos os metodos)
- Aluno, Plano, Data Inicio, Data Fim, Valor Total, Desconto, Observacoes

### Campos condicionais por forma de pagamento:

**DCC:**
- Numero de parcelas (pre-preenchido pela duracao do plano, editavel)
- Valor por parcela (calculado automaticamente)
- Ultimos 4 digitos do cartao
- Bandeira do cartao
- Preview de todas as parcelas com datas editaveis

**PIX:**
- Numero de parcelas (default: 1, editavel)
- Valor por parcela (calculado automaticamente)
- Preview de todas as parcelas com datas editaveis (0, 30, 60 dias...)

**Maquina da Rede:**
- Numero de parcelas da maquina (informativo apenas)
- Nenhum campo extra de parcelamento no sistema

**Dinheiro:**
- Nenhum campo extra

### Preview de parcelas (DCC e PIX)
Uma lista editavel mostrando:
```text
Parcela 1/12 - R$ 250,00 - 16/02/2026 [campo date editavel]
Parcela 2/12 - R$ 250,00 - 18/03/2026 [campo date editavel]
Parcela 3/12 - R$ 250,00 - 17/04/2026 [campo date editavel]
...
```

Ao salvar o contrato, o sistema gera automaticamente todas as cobrancas na tabela `invoices`.

---

## Frontend: InvoicesTab vira "Cobrancas"

### Renomear conceito
- Tab "Faturas" vira "Cobrancas"
- Botao "Nova Fatura" removido (cobrancas sao geradas pelo contrato)

### Novas colunas na tabela
- **Parcela**: ex: "3/12"
- **Tipo**: DCC, Maquina, PIX, Dinheiro
- **Status**: adicionar "Agendada" (amarelo claro, para cobrancas DCC futuras)

### Filtro por tipo de pagamento

---

## Frontend: InvoiceFormDialog vira "Registrar Pagamento"

Quando editando uma cobranca existente:
- Foco em registrar que o pagamento foi feito
- Campos: Data Pagamento, Valor Pago, Forma de Pagamento, Observacoes
- Nao permitir criar cobranca avulsa (cobrancas vem do contrato)

---

## Frontend: Finance.tsx

- Tab "Faturas" renomeada para "Cobrancas"
- KPI "Inadimplencia" atualizado para considerar cobrancas vencidas (DCC que falhou ou PIX nao pago)

---

## Hooks

### useContracts.ts
- Adicionar campos: `installments`, `total_paid_cents`, `card_last_four`, `card_brand`
- Atualizar `paymentMethodLabels`: adicionar `dcc: "DCC (Recorrente)"`, `card_machine: "Maquina (Rede)"`
- Remover opcoes nao utilizadas: `boleto`, `debit_card`, `transfer`
- Ao criar contrato: chamar Edge Function `generate-monthly-invoices` com `contract_id` para gerar cobrancas

### useInvoices.ts
- Adicionar campos: `payment_type`, `installment_number`, `total_installments`, `scheduled_date`
- Adicionar `scheduled: "Agendada"` aos labels e cores de status

---

## Edge Function: generate-monthly-invoices (reescrita)

Dois modos de operacao:

### Modo "contract-created" (chamado ao criar contrato)
Recebe `{ contract_id }` no body e gera cobrancas conforme o tipo de pagamento:

- **DCC**: N cobrancas com status `scheduled`, datas a cada 30 dias
- **PIX parcelado**: N cobrancas com status `pending`, com datas customizadas recebidas no body
- **Maquina/Dinheiro/PIX a vista**: 1 cobranca com status `pending`

O body tambem pode incluir `installment_dates` (array de datas) para DCC e PIX parcelado.

### Modo "cron" (diario, mantido)
- Verifica cobrancas `scheduled` cuja `scheduled_date <= hoje` e muda para `pending`
- Mantem logica de despesas recorrentes

---

## Edge Function: calculate-invoice-penalties (ajuste)

Aplicar penalidades apenas em cobrancas DCC vencidas (status `pending` ou `overdue` com `payment_type = 'dcc'`), nao em outros tipos.

---

## Sequencia de Implementacao

1. **Migration**: novos enums (`dcc`, `card_machine`, `scheduled`) e campos nas tabelas
2. **Edge Function**: reescrever `generate-monthly-invoices` com modo contract-created
3. **Edge Function**: ajustar `calculate-invoice-penalties` para filtrar por tipo DCC
4. **Hook**: atualizar `useContracts.ts` (novos campos + chamada da Edge Function ao criar)
5. **Hook**: atualizar `useInvoices.ts` (novos campos + novo status)
6. **UI**: reescrever `ContractFormDialog` com campos condicionais e preview de parcelas
7. **UI**: reescrever `InvoicesTab` como "CobrancasTab" com novas colunas
8. **UI**: atualizar `InvoiceFormDialog` para foco em "Registrar Pagamento"
9. **UI**: atualizar `Finance.tsx` (labels, remover botao nova fatura)

---

## Arquivos a criar/modificar

- **Migration**: 1 novo arquivo SQL
- **Modificar**: `supabase/functions/generate-monthly-invoices/index.ts`
- **Modificar**: `supabase/functions/calculate-invoice-penalties/index.ts`
- **Modificar**: `src/hooks/useContracts.ts`
- **Modificar**: `src/hooks/useInvoices.ts`
- **Reescrever**: `src/components/finance/ContractFormDialog.tsx`
- **Reescrever**: `src/components/finance/InvoicesTab.tsx`
- **Modificar**: `src/components/finance/InvoiceFormDialog.tsx`
- **Modificar**: `src/pages/Finance.tsx`

## Logica de calculo

```text
valor_total = price_cents do plano (conforme duracao)
valor_liquido = valor_total - discount_cents
valor_parcela = Math.round(valor_liquido / numero_parcelas)
ultima_parcela = valor_liquido - (valor_parcela * (N - 1))  // absorve arredondamento
```

## Mapeamento duracao -> parcelas default (DCC)

```text
anual    -> 12
semestral -> 6
trimestral -> 3
mensal   -> 1
avulso   -> 1
unico    -> 1
```
