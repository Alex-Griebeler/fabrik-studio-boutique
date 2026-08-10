# Runbook — PR T1 (Colaboradores: hardening + manage-team)

## Deploy (ordem obrigatória)

1. **Migration** `20260812150000_team_t1_roles_hardening.sql` em produção (via
   agente Lovable como executor; timeout de cliente ≠ falha — verificar estado
   antes de reenviar). As pós-condições embutidas ABORTAM a migration se
   qualquer promessa de privilégio/trigger não se materializar.
2. **Verificação**: `SELECT count(*) FROM user_roles WHERE role='admin'` (2 em
   09/08/2026); `SELECT relrowsecurity FROM pg_class WHERE oid='public.team_operations'::regclass`.
3. **Secret `APP_URL`** no Lovable Cloud (URL pública do app, sem barra final)
   e a URL `<APP_URL>/reset-password` adicionada à **allowlist de redirect**
   do Auth. Sem isso a função responde `server_misconfigured`.
4. **Deploy** da edge function `manage-team`.
5. **Smoke**: `OPTIONS` → 200 · `POST` sem credencial → 401 · `GET` → 405.
6. **Gate D8 (staging/real, checklist anexado à PR de T2 antes do merge dela):**
   - convite REAL para e-mail do Alex → e-mail chega, link abre
     `/reset-password`, senha definida, login funciona, papel visível;
   - `deleteUser` REAL pela Admin API de um usuário de teste (o cascade × guard
     já é coberto na CI no nível do banco; aqui valida-se o caminho GoTrue);
   - recovery REAL (`send_recovery`) de usuário confirmado;
   - anotar os rate limits efetivos do Auth (o cooldown de team_operations NÃO
     protege o endpoint público de recovery).

## Convite perdido (runbook assistido — `resend_invite` NÃO existe na v1)

Deletar identidade é DESTRUTIVO (cascades + `ON DELETE SET NULL`). Só
prosseguir se TODAS as condições passarem, na ordem:

1. Usuário nunca confirmado nem autenticado:
   ```sql
   SELECT id, email, invited_at, email_confirmed_at, last_sign_in_at
   FROM auth.users WHERE lower(email) = lower('<email>');
   -- exige: invited_at NOT NULL, email_confirmed_at NULL, last_sign_in_at NULL
   ```
2. **Inventário VIVO de referências** (gerado de pg_constraint — nunca lista
   manual, que envelhece quando nascem tabelas novas). Cada SQL gerado é
   AUTOCONTIDO (IDs literais; a coluna certa por tabela referenciada):
   ```sql
   WITH alvo AS (
     SELECT u.id AS auth_id, p.id AS profile_id
     FROM auth.users u LEFT JOIN public.profiles p ON p.auth_user_id = u.id
     WHERE lower(u.email) = lower('<email>')
   ), fks AS (
     SELECT c.conrelid::regclass AS tabela, a.attname AS coluna,
            c.confrelid::regclass AS referenciada,
            cardinality(c.conkey) AS n_colunas
     FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND c.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
       AND c.conrelid::regclass::text NOT IN ('public.user_roles','public.profiles')
   )
   SELECT CASE
     WHEN n_colunas > 1 THEN format('-- FK COMPOSTA em %s(%s): revisar MANUALMENTE e ABORTAR até entender', tabela, coluna)
     ELSE format('SELECT %L AS tabela, count(*) FROM %s WHERE %I = %L;',
       tabela, tabela, coluna,
       CASE WHEN referenciada = 'auth.users'::regclass
            THEN (SELECT auth_id FROM alvo)
            ELSE (SELECT profile_id FROM alvo) END)
   END
   FROM fks;
   -- executar cada SELECT gerado; QUALQUER contagem > 0 (ou FK composta) ⇒ ABORTAR
   ```
3. Registrar ANTES: e-mail normalizado, id antigo, operador, timestamp, motivo.
4. `auth.admin.deleteUser(<id antigo>)` → novo convite pela tela → registrar o
   id novo junto ao antigo.

## Reversão

- Edge: redeploy da versão anterior (as RPCs continuam inertes sem chamador).
- Migration: NÃO reverter os REVOKEs (fail-closed é o estado desejado). Se as
  RPCs precisarem sair: `DROP FUNCTION`; o guard de último admin deve FICAR.
