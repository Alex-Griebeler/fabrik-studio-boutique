# Auditoria independente do Claude Code — P0-1

Data: 2026-07-30

Revisor: Claude Code 2.1.162, modelo Opus, esforço alto

Escopo: diff `8162daf212ff9b07047c5a527accf589278b15e6..14d342223995105849313d0a824fbd0ab7dd0601`

# Veredito

**GO CONDICIONAL para revisão e staging; NO-GO para produção.**

O revisor confirmou que o PR remove a execução anônima das RPCs globais,
preserva a lógica financeira/KPI e substitui a autorização da anamnese baseada
somente no UUID por token aleatório, hash, TTL, uso único, rate limit e
allowlist.

# Achados aceitos

## ALTO — schema do pgcrypto não era comprovado pela migration

A migration chamava `extensions.gen_random_bytes` e `extensions.digest`, mas
não verificava se `pgcrypto` estava instalado nesse schema. Embora o snapshot
confirme `pgcrypto 1.3`, o schema precisa ser validado antes do deploy.

Correção requerida: preflight transacional explícito que interrompa a migration
se `pgcrypto` não estiver no schema `extensions`.

## ALTO — migration precisava falhar de forma controlada sob deriva

O banco possui deriva confirmada. O `DROP FUNCTION` antigo sem `IF EXISTS`
poderia abortar caso o overload tivesse sido removido manualmente. A tabela de
tokens também precisa de preflight para não mascarar aplicação parcial.

Correção requerida: `DROP FUNCTION IF EXISTS` e preflight que exija ausência da
tabela antes da criação.

## MÉDIO — grant da submissão contradizia a matriz documentada

O código concedia a RPC tokenizada apenas para `anon`, mas a documentação dizia
que staff autenticado também poderia preencher um link. Um navegador já
autenticado enviaria o JWT `authenticated` e receberia `permission denied`.

Correção requerida: conceder `EXECUTE` a `anon, authenticated`; o token continua
sendo a autorização de posse.

## MÉDIO — testes automatizados provavam grants, não as barreiras internas

Os testes iniciais verificavam ACL, RLS, `search_path` e remoção do overload,
mas não chamavam as funções por papel nem exercitavam o ciclo de vida do token.

Correção requerida: adicionar testes transacionais de autorização interna,
token válido, uso único, expiração, rate limit e allowlist.

# Achados aceitos como risco residual

- Quem conhece um `lead_id` pode provocar bloqueio temporário de 15 minutos
  após cinco tentativas inválidas. O UUID não é segredo, mas o vetor é DoS
  limitado; reemitir o link restaura o fluxo.
- Duas emissões simultâneas podem fazer uma chamada receber
  `unique_violation`. O índice garante integridade; falta apenas mensagem
  amigável para concorrência rara entre atendentes.
- Links antigos sem token deixam de funcionar intencionalmente e precisam ser
  reemitidos.
- O servidor aceita subconjuntos da anamnese; obrigatoriedade completa ainda é
  validada pelo frontend.

# Gaps que continuam bloqueando produção

1. Executar preflight read-only no ambiente alvo.
2. Aplicar a migration em staging compatível com produção.
3. Rodar pgTAP no ambiente Supabase local/staging.
4. Exercitar PostgREST com usuários reais de cada papel.
5. Validar links antigos pendentes e plano de reemissão.
6. Não liberar produção enquanto houver conflito entre schema real e
   pressupostos da migration.

# Critério final do revisor

- **GO staging:** pgcrypto em `extensions`, tabela de tokens ausente, overload
  antigo identificado ou já ausente de forma compreendida e sem dependências.
- **GO produção:** testes por papel e ciclo de vida verdes, documentação
  alinhada e deriva reconciliada.
- **NO-GO:** qualquer mismatch crítico de schema, autorização, dinheiro ou
  LGPD.

# Segunda revisão após correções

O Claude Code revisou novamente o diff não commitado, com foco nas quatro
correções acima.

Veredito: **GO para atualizar o PR #4; GO para staging; NO-GO para produção.**

Confirmações:

- o preflight de `pgcrypto` e de aplicação parcial é válido e transacional;
- o `DROP FUNCTION IF EXISTS` remove a fragilidade sob deriva sem criar overload
  ambíguo;
- o grant para `anon, authenticated` mantém o token como autorização de posse e
  alinha código, testes e documentação;
- os 30 asserts foram contados e revisados;
- os testes adicionais cobrem autorização interna, emissão, submissão anon e
  autenticada, uso único, expiração, rate limit, allowlist e tipos inválidos;
- nenhuma regressão crítica, alta ou média foi encontrada;
- nenhuma mudança fora do escopo P0-1 foi identificada.

Riscos baixos restantes:

- a primeira execução de `supabase test db` ainda precisa confirmar o insert
  mínimo em `auth.users` e o comportamento canônico de `auth.uid()` no ambiente
  Supabase;
- o preflight abortará corretamente se o ambiente local/staging não tiver
  `pgcrypto` em `extensions`.

Produção continua bloqueada até pgTAP e matriz PostgREST verdes em staging,
preflight read-only no alvo e plano de reemissão dos links antigos.

# Preflight read-only no ambiente alvo

Executado em 2026-07-30 pelo SQL editor do Lovable Cloud, sem DDL, DML ou
invocação de RPC. Resultado observado:

| Verificação | Resultado |
|---|---|
| `pgcrypto` | versão `1.3`, schema `extensions` |
| `public.anamnese_link_tokens` | ausente (`NULL`) |
| overload antigo de `update_lead_anamnese` | presente |
| `public.has_role(uuid, app_role)` | presente |
| views dependentes do overload antigo | `0` |
| crons com chamada textual direta a KPI/vencimentos | `0` |
| colunas requeridas em `public.leads` | `5/5` |

O ambiente alvo satisfaz as pré-condições estáticas da migration. Isso remove o
gap de preflight, mas **não muda o veredito para produção**: ainda faltam
aplicação em staging compatível, os 30 asserts pgTAP, a matriz PostgREST com
usuários reais de teste e o plano de reemissão de links antigos.
