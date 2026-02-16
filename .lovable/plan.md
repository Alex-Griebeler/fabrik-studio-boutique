
# Finalizar Modulo Financeiro - Analise da Auditoria e Plano de Acao

## Analise da Auditoria: O que faz sentido vs. o que nao se aplica

### O que JA ESTA IMPLEMENTADO (a auditoria nao reflete o estado atual)

A auditoria foi feita sobre uma versao anterior do codigo. Varias das criticas ja foram resolvidas na reestruturacao recente:

1. **Modelo de cobrancas**: A auditoria critica o modelo de "faturas mensais automaticas". Isso ja foi substituido pelo modelo de cobrancas geradas no ato da criacao do contrato (DCC, Maquina, PIX, Dinheiro) -- implementado na sessao anterior.
2. **Edge Function generate-monthly-invoices**: Ja foi reescrita com os modos `contract-created` e `cron`.
3. **Enums payment_method**: `dcc` e `card_machine` ja foram adicionados.
4. **Status scheduled**: Ja existe no enum `invoice_status`.
5. **Campos installments, total_paid_cents, card_last_four, card_brand**: Ja existem na tabela `contracts`.
6. **Campos payment_type, installment_number, total_installments, scheduled_date**: Ja existem na tabela `invoices`.
7. **Tab "Cobrancas"**: Ja renomeada na interface.
8. **ContractFormDialog**: Ja possui campos condicionais por forma de pagamento com preview de parcelas editaveis.

### O que FAZ SENTIDO corrigir agora (para finalizar o modulo)

**Prioridade 1 - Bugs reais no codigo atual:**

1. **Calculo de ocupacao incorreto (useAnalytics.ts linhas 135-141)**: O bug e real. O codigo conta `sessions.filter(completed).length` em vez de contar bookings reais da tabela `class_bookings`. Isso distorce os KPIs de operacoes.

2. **Dados do prestador NF-e vazios (emit-nfse linhas 129-131)**: Confirmado. Os campos `cnpj`, `inscricao_municipal` e `codigo_municipio` estao vazios (""). A emissao real via FocusNFe vai falhar. Solucao: usar variaveis de ambiente `FOCUSNFE_CNPJ_PRESTADOR`, `FOCUSNFE_INSCRICAO_MUNICIPAL`, `FOCUSNFE_CODIGO_MUNICIPIO`.

3. **Dados de cartao em texto plano (card_last_four, card_brand)**: A auditoria aponta risco PCI-DSS. Contudo, armazenar apenas os ultimos 4 digitos e a bandeira NAO e uma violacao PCI-DSS (isso e considerado informacao nao sensivel). Todos os gateways e recibos exibem esses dados. A recomendacao de remover essas colunas NAO faz sentido. O que seria proibido e armazenar o numero completo do cartao ou CVV.

**Prioridade 2 - Melhorias importantes para o modulo funcionar completo:**

4. **Deteccao de duplicatas na importacao de extratos**: Faz sentido. Adicionar campo `file_hash` na tabela `bank_imports` e verificar antes de importar.

5. **Validacao no generateMakeupCredit**: Faz sentido. Validar contrato ativo e nao permitir credito duplicado para a mesma sessao.

6. **Upload de comprovante de pagamento**: O campo `payment_proof_url` ja existe na tabela `invoices` mas a UI nao implementa o upload. Isso e util para PIX e Dinheiro.

### O que NAO faz sentido ou e prematuro

7. **Remover card_last_four e card_brand**: Como explicado acima, ultimos 4 digitos e bandeira NAO sao dados sensiveis segundo PCI-DSS. Manter.

8. **Integracoes Itau (CNAB, PIX API, Open Banking)**: Prematuro. Requer credenciamento, certificado digital, ambiente de homologacao. Nao e algo para implementar agora.

9. **Integracao API e-Rede**: Prematuro. Requer credenciamento PCI e PV ativo. O fluxo atual (maquina fisica + conciliacao bancaria) funciona.

10. **Calculo automatico de comissoes**: A logica depende de regras de negocio que variam por studio. Melhor manter manual por enquanto.

11. **Geracao de PDF/holerite**: Feature secundaria, nao bloqueia o modulo financeiro.

12. **Race conditions em useTrialWaitlist e useSessionQueries**: Validos tecnicamente mas de baixo impacto pratico (o studio tem poucos usuarios simultaneos). Podem ser tratados depois.

---

## Plano de Implementacao

### Etapa 1: Corrigir bug do calculo de ocupacao

**Arquivo:** `src/hooks/useAnalytics.ts` (linhas 135-141)

Substituir a contagem de sessoes completadas por uma query real na tabela `class_bookings`:

```text
// Atual (errado): conta 1 por sessao completada
totalBooked = scheduledOrCompleted.filter(s => s.status === "completed").length;

// Correto: contar bookings reais
const { count } = await supabase
  .from("class_bookings")
  .select("id", { count: "exact", head: true })
  .in("session_id", sessionIds)
  .neq("status", "cancelled");
totalBooked = count ?? 0;
```

### Etapa 2: Corrigir dados do prestador no emit-nfse

**Arquivo:** `supabase/functions/emit-nfse/index.ts` (linhas 129-131)

Substituir strings vazias por leitura de variaveis de ambiente e adicionar validacao:

```text
const cnpj = Deno.env.get("FOCUSNFE_CNPJ_PRESTADOR") || "";
const inscricao = Deno.env.get("FOCUSNFE_INSCRICAO_MUNICIPAL") || "";
const codigoMun = Deno.env.get("FOCUSNFE_CODIGO_MUNICIPIO") || "";

if (!cnpj || !inscricao || !codigoMun) {
  // retornar erro claro em vez de enviar payload invalido
}

prestador: { cnpj, inscricao_municipal: inscricao, codigo_municipio: codigoMun }
```

Sera necessario solicitar ao usuario as 3 variaveis de ambiente.

### Etapa 3: Deteccao de duplicatas na importacao bancaria

**Migration:** Adicionar coluna `file_hash` na tabela `bank_imports`.

**Arquivo:** `supabase/functions/parse-bank-statement/index.ts`

Calcular hash SHA-256 do conteudo do arquivo antes de processar e verificar se ja existe no banco.

### Etapa 4: Validacao no makeup credit

**Arquivo:** `src/hooks/schedule/useSessionMutations.ts`

Antes de inserir credito de reposicao, validar:
- Contrato do aluno esta ativo
- Sessao nao possui credito de reposicao ja gerado

### Etapa 5: Upload de comprovante de pagamento

**Arquivo:** `src/components/finance/InvoiceFormDialog.tsx`

Adicionar campo de upload de arquivo ao registrar pagamento (PIX/Dinheiro), salvando no storage e atualizando `payment_proof_url`.

**Migration/Storage:** Criar bucket `payment-proofs` (privado).

---

## Arquivos a modificar

- `src/hooks/useAnalytics.ts` -- corrigir occupancyRate
- `supabase/functions/emit-nfse/index.ts` -- usar env vars do prestador
- `supabase/functions/parse-bank-statement/index.ts` -- hash de duplicatas
- `src/hooks/schedule/useSessionMutations.ts` -- validacao makeup credit
- `src/components/finance/InvoiceFormDialog.tsx` -- upload de comprovante
- 1 migration SQL (file_hash + storage bucket)

## O que NAO sera alterado (justificativa)

- `card_last_four` e `card_brand`: NAO sao dados sensiveis PCI, manter
- Integracoes Itau/Rede: prematuras, requerem credenciamento externo
- Calculo automatico de comissoes: regras de negocio indefinidas
- Race conditions em waitlist/sessions: baixo impacto pratico
