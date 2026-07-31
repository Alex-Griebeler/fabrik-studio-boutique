# P0-3a — Restringir `public.policies`

## Escopo

Este PR fecha somente a exposição da tabela `public.policies`. A normalização
global de grants permanece fora deste PR para reduzir o raio de regressão.

Evidência runtime de 2026-07-30:

- `policies_select` estava em `SELECT TO public USING (true)`;
- `anon` possuía grant de leitura;
- a tabela continha 28 chaves, inclusive telefone shadow, treinador fallback,
  janelas de envio e parâmetros dos agentes;
- o editor consumia nove chaves na rota `/settings`, restrita a `admin`;
- `CancelSessionDialog` consumia os dois cutoffs de cancelamento na rota de
  agenda, acessível a `admin`, `manager`, `instructor` e `reception`.

## Alterações

1. revoga todos os privilégios de `PUBLIC`, `anon` e `authenticated` na tabela;
2. devolve a `authenticated` somente `SELECT` e `UPDATE`;
3. substitui a policy pública por leitura total e atualização exclusivas para
   `admin`, mais leitura somente dos dois cutoffs para `manager`, `instructor` e
   `reception`;
4. remove as policies de `INSERT` e `DELETE` para o cliente;
5. mantém `service_role` intacta para as Edge Functions;
6. limita a consulta do editor às nove chaves de regras de negócio exibidas na
   tela, sem carregar configuração de roteamento/assiduidade para o navegador.

## Critérios objetivos de aceite

- `anon` não possui `SELECT` e recebe SQLSTATE `42501` ao consultar a tabela;
- papéis operacionais leem somente os dois cutoffs exigidos pela agenda e não
  atualizam nenhuma linha;
- `student` e usuários sem papel não leem linhas;
- `admin` lê e atualiza linhas existentes;
- `authenticated` não possui `INSERT`, `DELETE`, `TRUNCATE`, `REFERENCES` ou
  `TRIGGER`;
- `service_role` mantém leitura para as Edge Functions;
- não existe policy de `policies` com papel `public`;
- a tela de configurações continua carregando e salvando suas nove chaves;
- o diálogo de cancelamento continua recebendo os dois cutoffs para os papéis
  autorizados na agenda;
- nenhuma migration, cron, Edge Function, secret ou flag de assiduidade é
  alterada.

## Validação

- `supabase/tests/p0_3_restrict_policies_access.test.sql` cobre ACL, destino das
  policies e comportamento de `anon`, `instructor`, `manager`, `reception`,
  `student` e `admin`;
- `npm run build` valida a consulta tipada do frontend;
- o teste SQL exige ambiente Supabase local com Docker disponível.

## Rollback

Não reabrir `SELECT TO public` nem devolver grants a `anon`.

Se um fluxo legítimo não-admin for identificado, o rollback seguro é conceder
somente a chave necessária por uma view/RPC autenticada e versionada, ou ampliar
a policy para um papel explicitamente aprovado. Restaurar a policy pública
reintroduz a exposição LGPD e não é rollback aceitável.

## Gate de produção

**NO-GO para deploy** enquanto:

- o P0-2 não estiver contido;
- os testes SQL por papel não forem executados em ambiente isolado;
- o inventário runtime pré-deploy não confirmar o mesmo schema e os mesmos
  consumidores.
