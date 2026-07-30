# P0-1 — Contenção de RPCs privilegiadas

## Objetivo

Eliminar execução anônima das RPCs globais de KPI e vencimento de faturas e
substituir a autorização da anamnese baseada apenas no UUID do lead por um link
expirável e de uso único.

## Contrato de autorização

| Operação | `anon` | `student`/`instructor` | `admin`/`manager` | `reception` | `service_role` |
|---|---:|---:|---:|---:|---:|
| `calculate_monthly_kpis` | nega | nega | permite | nega | permite |
| `mark_overdue_invoices` | nega | nega | permite | nega | permite |
| `issue_anamnese_link` | nega | nega | permite | permite | nega pela API |
| `update_lead_anamnese` | token válido | token válido | token válido | token válido | nega pela API |

O grant de `authenticated` nas duas primeiras RPCs apenas permite que a função
seja alcançada; a função volta a conferir o papel no banco antes de executar
DML. Isso evita depender da autorização do frontend.

## Propriedades do link de anamnese

- token aleatório de 256 bits;
- somente o hash SHA-256 é persistido;
- validade padrão de 7 dias, limitada no banco ao intervalo de 15 minutos a
  30 dias;
- emissão de um link invalida links anteriores ainda não usados;
- uso único garantido por lock pessimista (`FOR UPDATE`);
- cinco tentativas inválidas bloqueiam o token por 15 minutos;
- token transportado no fragmento `#token=`, que não é enviado ao servidor no
  request da página, e removido da barra após a carga;
- payload limitado a 32 KiB e reconstruído por allowlist de campos nos grupos
  `dados_pessoais`, `perfil`, `treino` e `parq`, além de metadados definidos no
  servidor;
- tabela de hashes com RLS e sem privilégios de tabela para `anon` ou
  `authenticated`.

## Arquivos

- `supabase/migrations/20260730180938_secure_privileged_rpcs_and_anamnese_links.sql`
- `supabase/tests/p0_1_secure_rpcs.test.sql`
- `src/pages/Anamnese.tsx`
- `src/pages/Leads.tsx`
- `src/components/leads/LeadTable.tsx`
- `src/components/leads/LeadDetailDialog.tsx`
- `src/hooks/useLeads.ts`
- `src/integrations/supabase/types.ts`

## Validação obrigatória antes do merge

1. Aplicar a migration em clone/staging compatível com produção.
2. Executar `supabase test db`.
3. Repetir a matriz de autorização acima com usuários reais de teste.
4. Confirmar que:
   - o overload antigo
     `update_lead_anamnese(uuid,jsonb,text,text,text)` não existe;
   - nenhum papel possui `SELECT` em `anamnese_link_tokens`;
   - link correto atualiza somente o lead vinculado;
   - segunda submissão, token errado, expirado ou bloqueado falham;
   - gerar um segundo link invalida o primeiro.
5. Executar `npm run test`, `npm run build` e lint dos arquivos alterados.

## Rollback

Não restaurar a RPC antiga em produção: isso reabre o P0 crítico.

Se a emissão de links falhar após o deploy:

1. manter revogados os grants anônimos de KPI e vencimentos;
2. ocultar temporariamente o botão de geração no frontend;
3. coletar anamnese por processo manual controlado;
4. corrigir a migration por uma migration forward;
5. reemitir links, sem reaproveitar tokens anteriores.

Rollback integral só é aceitável em staging descartável.
