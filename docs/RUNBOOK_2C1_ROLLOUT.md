# Runbook de deploy — Onda 2c-1 (rollout A4, fail-closed em 2 fases)

Migration e deploy de Edge **não são atômicos**. O rollout abaixo garante que
nenhum import escape da malha de confiança: qualquer import criado na janela
entre a migration e a Edge versionada nasce `unknown` (não-confiável) e entra
em **quarentena com relatório** — nunca é promovido silenciosamente.

## Ordem obrigatória

1. **Migration** `20260811150000_conciliacao_2c1_parser_version.sql` em
   produção (via `send_message` ao agente Lovable; timeout de cliente ≠ falha —
   verificar estado antes de reenviar). Registrar em
   `supabase_migrations.schema_migrations`.
2. **Verificar o backfill** (deve ser exatamente o nº de imports pré-existentes;
   em 09/08/2026 são 6):

   ```sql
   SELECT parser_version, count(*) FROM bank_imports GROUP BY 1;
   -- esperado: legacy_untrusted = <nº pré-existente>; nada mais
   ```

3. **Deploy das duas Edge functions** (`parse-bank-statement`,
   `match-bank-transactions`) pelo agente Lovable.
4. **Smoke pós-deploy:**
   - `match-bank-transactions` com `{"auto_apply": true}` e JWT admin → **400**;
   - sem credencial → **401**;
   - importação de teste NÃO é necessária em produção (o carimbo é coberto por
     teste de unidade + pgTAP).

## Gate de quarentena (pós-condição do deploy — o deploy NÃO está concluído sem isto)

```sql
SELECT id, file_name, created_at
FROM bank_imports
WHERE parser_version = 'unknown';
```

- **Resultado vazio** (esperado se ninguém importou na janela): registrar
  "quarentena A4: 0 imports" no PR/memória e encerrar.
- **Resultado não-vazio**: cada linha é um import da janela. Registrar
  id/arquivo/data no PR/memória e, para cada um: apagar (2c-2+) e reimportar
  com a Edge versionada, OU manter explicitamente em quarentena anotada.
  `unknown` NUNCA entra em allowlist — deixar como está é seguro, mas o
  registro é obrigatório.

## Reversão

Colunas novas não quebram a Edge antiga (INSERT sem a coluna cai no default).
Para reverter o comportamento: redeployar a versão anterior das functions —
os imports passam a nascer `unknown` (fail-closed, sem allowlist), nunca
confiáveis por engano. Não há motivo para reverter a migration.
