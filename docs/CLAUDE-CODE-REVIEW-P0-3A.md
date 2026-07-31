# Revisão independente do Claude Code — P0-3a

Data: 2026-07-31

Modo: somente leitura
Resultado final: **GO para commit/PR; NO-GO para deploy**

## Escopo revisado

- migration `20260731131620_p0_3_restrict_policies_access.sql`;
- pgTAP `p0_3_restrict_policies_access.test.sql`;
- `src/hooks/usePolicies.ts`;
- `docs/P0-3A-RESTRICT-POLICIES.md`;
- migrations históricas de `public.policies`, `public.has_role` e do enum de
  papéis;
- rotas, editor de policies, diálogo de cancelamento e os seis consumidores
  servidor de `public.policies`.

## Primeiro parecer

O revisor não encontrou achados críticos ou altos e aprovou a arquitetura,
migration e minimização de dados. Ele identificou duas pendências médias:

1. confirmar todos os consumidores frontend dos hooks genéricos;
2. tornar o pgTAP mais portátil e executá-lo em Supabase local limpo.

O grep integral revelou um consumidor operacional legítimo em
`src/components/schedule/CancelSessionDialog.tsx:28-33`. A primeira versão da
policy, restrita totalmente a `admin`, faria `manager`, `instructor` e
`reception` caírem silenciosamente no fallback de 12 horas.

## Correções aplicadas após o parecer

- a policy operacional permite somente
  `personal_cancellation_cutoff_hours` e
  `group_cancellation_cutoff_hours` para `manager`, `instructor` e `reception`;
- `admin` mantém leitura total e atualização de linhas existentes;
- `student`, usuários sem papel e `anon` não recebem linhas;
- configuração de agentes, telefone shadow, fallback e routing continuam fora
  da superfície operacional do navegador;
- o pgTAP agora define `search_path = public, extensions, auth`;
- os testes definem tanto `request.jwt.claim.sub` quanto
  `request.jwt.claims`;
- a cobertura passou a 24 asserções e inclui `anon`, `instructor`, `manager`,
  `reception`, `student` e `admin`.

## Rechecagem final

O Claude Code reabriu os arquivos corrigidos e declarou:

- 7/7 critérios verificados;
- `plan(24)` corresponde exatamente a 24 asserts;
- nenhum risco novo de regressão nos consumidores servidor;
- enum `manager`/`reception` já existe antes desta migration;
- nenhum mismatch crítico;
- **GO para commit/PR**;
- **NO-GO para deploy**.

## Validações executadas

- `npx tsc --noEmit --pretty false`: passou;
- Vitest: 15 arquivos e 281 testes passaram;
- contagem estática pgTAP: 24 asserts para `plan(24)`;
- pgTAP real: não executado, pois não há Postgres local em
  `127.0.0.1:54322`;
- build/lint completos: não concluíram por bloqueio de I/O do filesystem; o
  lint direcionado também encontrou uma instalação local corrompida de
  `node_modules/globals/globals.json`, não um erro do arquivo alterado.

## Gate final

### Commit/PR — GO

O escopo é pequeno, auditável e não toca produção.

### Deploy — NO-GO

Não implantar enquanto qualquer condição permanecer aberta:

1. P0-2 não contido;
2. pgTAP por papel não executado em ambiente isolado;
3. inventário runtime pré-deploy não reconfirmado;
4. build/lint completos não concluídos em filesystem saudável.

O revisor não editou arquivos, não conectou à produção, não leu secrets e não
executou ações externas.
