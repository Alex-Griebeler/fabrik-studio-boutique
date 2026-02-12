
# Plano de Auditoria Completa do Sistema Fabrik

## Objetivo
Revisao sistematica de todo o codigo em busca de erros, bugs, violacoes de padroes de qualidade e melhorias, dividida em 6 etapas para execucao progressiva sem sobrecarregar o sistema.

---

## Etapa 1: Tipagem e Qualidade de Codigo

**Problema identificado**: O padrao do projeto exige "100% TypeScript, zero `as any`", mas foram encontradas **42 instancias de `as any`** em 4 arquivos:

| Arquivo | Qtd | Descricao |
|---------|-----|-----------|
| `useConversations.ts` | 2 | `setConversations((data as any))`, `setMessages((data as any))` |
| `useAIAgentConfig.ts` | 4 | `setAgents((data as any))`, `knowledge_base as any`, `handoff_rules as any`, `behavior_config as any` |
| `useNurturingSequences.ts` | 3 | `setSteps((data as any))`, `setExecutions((data as any))`, `update(updates as any)` |
| `SequenceBuilder.tsx` | 1 | `saveSequence({...} as any)` |

**Acao**: Substituir todos os `as any` por tipagens corretas usando os tipos gerados em `types.ts` ou interfaces proprias.

**Bonus**: Tambem ha ~19 arquivos com `as unknown as`, que e um padrao mais aceitavel mas poderia ser melhorado com generics do Supabase.

---

## Etapa 2: Seguranca e Autenticacao

**Problemas identificados**:

1. **ProtectedRoute nao filtra por role**: Qualquer usuario autenticado acessa TODAS as rotas (finance, payroll, analytics, marketing-ai). Um usuario com role `instructor` pode acessar `/expenses` ou `/bank-reconciliation` que tem RLS bloqueando os dados, mas o frontend nao impede a navegacao, resultando em telas vazias ou confusas.

2. **Sidebar mostra todos os menus para todos**: `AppSidebar.tsx` renderiza todos os links sem verificar a role do usuario. Um instrutor ve "Folha Pagto", "Conciliacao", "Comissoes" etc.

3. **Leaked Password Protection desabilitado**: O linter identificou que a protecao contra senhas vazadas esta desabilitada.

4. **Edge functions com `verify_jwt = false`**: Todas as 4 edge functions estao sem verificacao JWT. `process-conversation-message` e `execute-nurturing-step` deveriam exigir autenticacao.

**Acao**: 
- Adicionar prop `allowedRoles` ao `ProtectedRoute` e filtrar rotas por role.
- Filtrar itens do sidebar conforme role do usuario.
- Habilitar leaked password protection.
- Ativar `verify_jwt = true` para edge functions que nao sao webhooks externos.

---

## Etapa 3: Hooks do Sprint 6 (Marketing IA) - Padrao e Consistencia

**Problemas identificados**:

1. **Inconsistencia de pattern**: Os hooks `useAIAgentConfig`, `useConversations` e `useNurturingSequences` usam `useState + useEffect + useCallback` manualmente, enquanto TODO o resto do projeto usa **React Query** (`useQuery + useMutation`). Isso cria:
   - Falta de cache automatico e deduplicacao de requests
   - Falta de `staleTime` e refetch automatico
   - Sem loading/error states padronizados
   - Re-renders desnecessarios por conta de `useCallback` com deps de `toast`

2. **`loadSequences` depende de `selectedSeqId`**: O `useCallback` de `loadSequences` inclui `selectedSeqId` nas dependencias, causando reload infinito sempre que a selecao muda.

3. **Silenciamento de erros**: `useNurturingSequences` tem `catch { /* silent */ }` em `loadSteps` e `loadExecutions`, engolindo erros sem feedback.

**Acao**: Refatorar os 3 hooks do Sprint 6 para usar React Query, seguindo o padrao dos demais hooks (`useLeads`, `useExpenses`, `useTasks`, etc.).

---

## Etapa 4: Logica de Negocio e Bugs Funcionais

**Problemas identificados**:

1. **Dashboard `useRecentLeads` busca da tabela `students`**: O hook busca de `students` filtrando `status = 'lead'`, mas o sistema de leads real usa a tabela `leads`. Os dados mostrados podem ser inconsistentes.

2. **`useConvertLead` cria comissao com valores zerados**: Ao converter lead, cria comissao com `valor_base_cents: 0`, `percentual_comissao: 0`, `valor_comissao_cents: 0`. A comissao so fara sentido quando vinculada a um contrato com valor.

3. **`useDashboardKPIs` - calculo de ocupacao**: Busca sessions do mes atual com status `scheduled`, mas sessions que ja aconteceram teriam status diferente (`completed`), potencialmente subestimando a ocupacao.

4. **Conciliacao bancaria `useBatchApproveMatches`**: Loop sequencial `for...of` para aprovar matches em lote, sem usar batch insert. Se uma falhar no meio, as anteriores ja foram aplicadas sem rollback.

5. **Edge function `execute-nurturing-step`**: Busca `step_number = current_step + 1`, mas se steps foram deletados e re-numerados, pode pular steps ou nao encontrar o correto.

**Acao**: Corrigir cada bug individualmente conforme descrito.

---

## Etapa 5: Performance e Otimizacao

**Problemas identificados**:

1. **`useBankTransactions` com `.limit(5000)`**: Excede o limite padrao de 1000 do Supabase. Se houver mais de 1000 transacoes, o resultado sera truncado silenciosamente.

2. **`useDashboardKPIs` faz N+1 query**: Busca sessions, depois faz uma query separada para bookings. Poderia ser um join ou query mais eficiente.

3. **`useConversations` recarrega TODAS as conversas (`loadConversations`) apos cada mensagem enviada**: Deveria usar invalidacao seletiva ou update otimista.

4. **Falta de `staleTime` em varias queries**: Hooks como `useStudents`, `useLeads`, `useContracts` nao definem `staleTime`, causando re-fetches desnecessarios a cada re-mount.

5. **QueryClient sem configuracao global**: O `queryClient` em `App.tsx` e criado com defaults, sem `defaultOptions` para `staleTime`, `gcTime`, ou `retry`.

**Acao**: Aplicar limites corretos, adicionar `staleTime` padrao, configurar QueryClient global e otimizar queries N+1.

---

## Etapa 6: UI/UX e Acessibilidade

**Problemas identificados**:

1. **Layout Marketing IA fixo em 4 colunas**: `ConversationManager`, `AIAgentConfig` e `SequenceBuilder` usam `grid-cols-4` que nao e responsivo. Em telas menores ficara quebrado.

2. **Falta de empty states e error boundaries**: Nem todos os modulos tem tratamento visual para estados de erro ou listas vazias de forma consistente.

3. **Falta de confirmacao em acoes destrutivas**: `deleteAgent`, `deleteSequence`, `deleteConversation` deletam diretamente sem dialog de confirmacao.

4. **`resetPassword` redireciona para `/reset-password`**: Mas essa rota nao existe no `App.tsx`. O usuario que clicar no link de reset recebera 404.

**Acao**: Adicionar responsividade, dialogs de confirmacao, rota de reset de senha e melhorar empty/error states.

---

## Ordem de Execucao Recomendada

1. **Etapa 2** (Seguranca) - Prioridade critica
2. **Etapa 4** (Bugs funcionais) - Impacto direto no usuario
3. **Etapa 1** (Tipagem) - Qualidade de codigo
4. **Etapa 3** (Refatoracao hooks Sprint 6) - Consistencia
5. **Etapa 5** (Performance) - Otimizacao
6. **Etapa 6** (UI/UX) - Polish

Cada etapa sera implementada em uma mensagem separada para manter o controle e facilitar a revisao.
