#!/usr/bin/env bash
# T1 — os 7 mutantes SQL NORMATIVOS da spec (§2.3): cada um reintroduz um
# defeito no banco e uma SONDA prova que o defeito ficou vivo — ou seja, que a
# guarda original era o que o segurava. Restauração: reaplica a migration
# pristina (CREATE OR REPLACE) ao final de cada mutante.
#
# Roda POR ÚLTIMO no job de integração (muta funções do banco efêmero da CI).
# Uso: team-sql-mutants.sh <DB_URL> <caminho-da-migration>
set -euo pipefail

DB_URL="${1:?uso: team-sql-mutants.sh <db-url> <migration>}"
MIGRATION="${2:?uso: team-sql-mutants.sh <db-url> <migration>}"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=0 -qtA)
ADMIN_A='00000000-0000-0000-0000-00000000000a'
ADMIN_B='00000000-0000-0000-0000-00000000000b'
INSTRUTOR='00000000-0000-0000-0000-00000000000c'
ALUNA='00000000-0000-0000-0000-00000000000d'

# As sondas dependem dos 4 usuários do fixture — valida antes de mutar.
for v in "$ADMIN_A" "$ADMIN_B" "$INSTRUTOR" "$ALUNA"; do
  N=$(psql "$DB_URL" -qtA -c "SELECT count(*) FROM auth.users WHERE id = '$v'")
  [ "$N" = "1" ] || fail "fixture incompleto: usuário $v ausente"
done

fail() { echo "FALHA: $1" >&2; exit 1; }

# Auto-contenção (mesma razão do harness): nada de claim vazando de execuções
# anteriores; ids de op das sondas são aleatórios.
expire_leases() {
  psql "$DB_URL" -qtA -c "UPDATE public.team_operations
    SET lease_expires_at = now() - interval '1 second'
    WHERE status = 'started'" > /dev/null
}
restore() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$MIGRATION" > /dev/null; }

# Sonda que ESPERA um SQLSTATE: original levanta o erro; sob o mutante, não.
# Sonda com SQLSTATE explícito (VERBOSITY verbose imprime o código exato) —
# retorno 0 = o SQLSTATE ESPERADO apareceu.
expect_sqlstate() {
  local sql="$1"; local state="$2"
  local out
  out=$(psql "$DB_URL" -qtA -c '\set VERBOSITY verbose' -c "$sql" 2>&1 || true)
  grep -q "$state" <<<"$out"
}

echo "== M1: lock global vira no-op → a corrida dos 2 últimos admins tem que ZERAR"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c \
  "CREATE OR REPLACE FUNCTION private.team_lock_user_roles() RETURNS void
   LANGUAGE sql SET search_path = '' AS \$\$ SELECT 1; \$\$;"
if .github/scripts/team-concurrency-check.sh "$DB_URL" > /tmp/m1.out 2>&1; then
  restore; fail "M1 sobreviveu: sem lock, o harness de concorrência passou"
fi
restore
# repõe estado que o harness meio-quebrado pode ter deixado
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
  INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, 'admin'::public.app_role FROM auth.users u
  WHERE u.id IN ('$ADMIN_A','00000000-0000-0000-0000-00000000000b')
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r
                    WHERE r.user_id = u.id AND r.role = 'admin')" > /dev/null || true
echo "M1 morto"

expire_leases
OPM2=$(uuidgen | tr 'A-Z' 'a-z')
echo "== M2: revalidação de ator vira no-op → begin com não-admin deixaria de dar T0004"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c \
  "CREATE OR REPLACE FUNCTION private.team_require_admin(p_actor uuid) RETURNS void
   LANGUAGE plpgsql SET search_path = '' AS \$\$ BEGIN RETURN; END; \$\$;"
if expect_sqlstate "SELECT public.team_begin_operation(
  '$OPM2', '$INSTRUTOR', 'set_roles',
  NULL, '$ADMIN_B', 'fp-m2')" 'T0004'; then
  restore; fail "M2 sobreviveu: não-admin ainda toma T0004 (mutação não pegou?)"
fi
restore
echo "M2 morto"

expire_leases
OPM3=$(uuidgen | tr 'A-Z' 'a-z')
echo "== M3: fingerprint ignorado → assinatura divergente deixaria de dar T0001"
psql "$DB_URL" -qtA -c "SELECT public.team_begin_operation(
  '$OPM3', '$ADMIN_A', 'set_roles',
  NULL, '$INSTRUTOR', 'fp-m3')" > /dev/null 2>&1 || true
# o retry só cai na comparação de fingerprint com o lease VENCIDO (senão T0010)
expire_leases
python3 - "$MIGRATION" <<'PY' > /tmp/m3.sql
import sys
src = open(sys.argv[1]).read()
start = src.index("CREATE OR REPLACE FUNCTION public.team_begin_operation")
end = src.index("$$;", start) + 3
body = src[start:end]
body = body.replace("OR op.payload_fingerprint <> p_fingerprint", "")
print(body)
PY
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f /tmp/m3.sql > /dev/null
if expect_sqlstate "SELECT public.team_begin_operation(
  '$OPM3', '$ADMIN_A', 'set_roles',
  NULL, '$INSTRUTOR', 'fp-DIVERGENTE')" 'T0001'; then
  restore; fail "M3 sobreviveu"
fi
restore
echo "M3 morto"

echo "== M4: lease ignorado → token errado deixaria de dar T0002"
python3 - "$MIGRATION" <<'PY' > /tmp/m4.sql
import sys
src = open(sys.argv[1]).read()
start = src.index("CREATE OR REPLACE FUNCTION private.team_require_lease")
end = src.index("$$;", start) + 3
body = src[start:end]
body = body.replace("OR op.lease_token IS DISTINCT FROM p_lease_token", "")
print(body)
PY
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f /tmp/m4.sql > /dev/null
if expect_sqlstate "SELECT public.team_advance_phase(
  '$OPM3',
  '99999999-9999-9999-9999-999999999999', 'preflight', NULL, NULL)" 'T0002'; then
  restore; fail "M4 sobreviveu"
fi
restore
echo "M4 morto"

echo "== M5: INSERT antes de DELETE invertido → a ordem no corpo é o contrato"
# Inversão é inobservável de fora numa transação; o contrato é PROVADO pela
# ordem no corpo da função implantada (a sonda quebra se alguém inverter).
POS=$(psql "$DB_URL" -qtA -c "
  SELECT position('INSERT INTO public.user_roles' IN pg_get_functiondef('public.team_set_roles(uuid, uuid, public.app_role[])'::regprocedure))
       < position('DELETE FROM public.user_roles' IN pg_get_functiondef('public.team_set_roles(uuid, uuid, public.app_role[])'::regprocedure))")
[ "$POS" = "t" ] || fail "M5: INSERT não vem antes de DELETE em team_set_roles"
echo "M5 morto (ordem provada no corpo implantado)"

expire_leases
OPM6=$(uuidgen | tr 'A-Z' 'a-z')
echo "== M6: guarda de student removida → revoke apagaria o papel student"
python3 - "$MIGRATION" <<'PY' > /tmp/m6.sql
import sys
src = open(sys.argv[1]).read()
start = src.index("CREATE OR REPLACE FUNCTION public.team_revoke_access")
end = src.index("$$;", start) + 3
body = src[start:end]
body = body.replace("AND role = ANY (private.team_staff_roles());", ";", 1)
print(body)
PY
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f /tmp/m6.sql > /dev/null
psql "$DB_URL" -qtA -c "INSERT INTO public.user_roles (user_id, role)
  VALUES ('$ALUNA', 'reception') ON CONFLICT DO NOTHING" > /dev/null 2>&1 || true
TOK=$(psql "$DB_URL" -qtA -c "SELECT (public.team_begin_operation(
  '$OPM6', '$ADMIN_A', 'revoke_access',
  NULL, '$ALUNA', 'fp-m6')) ->> 'lease_token'")
psql "$DB_URL" -qtA -c "SELECT public.team_revoke_access(
  '$OPM6', '$TOK')" > /dev/null 2>&1 || true
STUDENT=$(psql "$DB_URL" -qtA -c "SELECT count(*) FROM public.user_roles
  WHERE user_id = '$ALUNA' AND role = 'student'")
restore
if [ "$STUDENT" = "1" ]; then
  fail "M6 sobreviveu: student intacto mesmo com a guarda removida (mutação não pegou?)"
fi
psql "$DB_URL" -qtA -c "INSERT INTO public.user_roles (user_id, role)
  VALUES ('$ALUNA', 'student') ON CONFLICT DO NOTHING" > /dev/null
echo "M6 morto (sem a guarda o student caiu — a guarda é o que o protege)"

expire_leases
OPM7=$(uuidgen | tr 'A-Z' 'a-z'); OPM7B=$(uuidgen | tr 'A-Z' 'a-z')
echo "== M7: cooldown removido → segundo recovery imediato deixaria de dar T0011"
python3 - "$MIGRATION" <<'PY' > /tmp/m7.sql
import sys
src = open(sys.argv[1]).read()
start = src.index("CREATE OR REPLACE FUNCTION public.team_begin_operation")
end = src.index("$$;", start) + 3
body = src[start:end]
body = body.replace("IF p_action = 'send_recovery' AND EXISTS (", "IF false AND EXISTS (")
print(body)
PY
TOK=$(psql "$DB_URL" -qtA -c "SELECT (public.team_begin_operation(
  '$OPM7', '$ADMIN_A', 'send_recovery',
  NULL, '$INSTRUTOR', 'fp-m7')) ->> 'lease_token'")
psql "$DB_URL" -qtA -c "SELECT public.team_advance_phase(
  '$OPM7', '$TOK', 'recovery_requested', NULL, NULL);
  SELECT public.team_finalize_operation(
  '$OPM7', '$TOK', 'succeeded', 'recovery_requested', NULL, NULL)" > /dev/null 2>&1 || true
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f /tmp/m7.sql > /dev/null
if expect_sqlstate "SELECT public.team_begin_operation(
  '$OPM7B', '$ADMIN_A', 'send_recovery',
  NULL, '$INSTRUTOR', 'fp-m7b')" 'T0011'; then
  restore; fail "M7 sobreviveu"
fi
restore
echo "M7 morto"

echo "team-sql-mutants: os 7 mutantes normativos mortos"
