#!/usr/bin/env bash
# T1 — teste de CONCORRÊNCIA REAL com duas conexões (pgTAP numa sessão só não
# prova serialização). Roda contra o Postgres local do supabase CLI.
#
# Cenário 1: os DOIS últimos admins removidos em transações concorrentes —
#   exatamente UMA deve falhar (T0003); o advisory lock serializa.
# Cenário 2: dois team_begin_operation simultâneos para o MESMO alvo+ação com
#   operation_ids diferentes — exatamente UM deve falhar (T0005).
#
# Uso: team-concurrency-check.sh <DB_URL>
set -euo pipefail

DB_URL="${1:?uso: team-concurrency-check.sh <db-url>}"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=0 -qtA)

ADMIN_A='00000000-0000-0000-0000-00000000000a'
ADMIN_B='00000000-0000-0000-0000-00000000000b'
TARGET='00000000-0000-0000-0000-00000000000c'

fail() { echo "FALHA: $1" >&2; exit 1; }

# ── Cenário 1: último-admin sob corrida ─────────────────────────────────────
# Duas transações abertas em paralelo, cada uma deletando UM admin diferente.
# Sem serialização, ambas veriam "existe outro admin" e passariam.

rm -f /tmp/team-conc-1a.out /tmp/team-conc-1b.out

"${PSQL[@]}" <<SQL > /tmp/team-conc-1a.out 2>&1 &
BEGIN;
DELETE FROM public.user_roles WHERE user_id = '$ADMIN_A' AND role = 'admin';
SELECT pg_sleep(2);
COMMIT;
SQL
PID_A=$!

sleep 0.5

"${PSQL[@]}" <<SQL > /tmp/team-conc-1b.out 2>&1 &
BEGIN;
DELETE FROM public.user_roles WHERE user_id = '$ADMIN_B' AND role = 'admin';
COMMIT;
SQL
PID_B=$!

wait "$PID_A" || true
wait "$PID_B" || true

ERRS=$(grep -l 'T0003\|último admin' /tmp/team-conc-1a.out /tmp/team-conc-1b.out | wc -l | tr -d ' ')
REMAINING=$("${PSQL[@]}" -c "SELECT count(*) FROM public.user_roles WHERE role = 'admin'")

[ "$ERRS" = "1" ] || fail "cenário 1: esperado exatamente 1 falha T0003, houve $ERRS"
[ "$REMAINING" = "1" ] || fail "cenário 1: esperado exatamente 1 admin restante, há $REMAINING"
echo "cenário 1 OK: corrida dos 2 últimos admins deixou exatamente 1"

# repõe o estado
"${PSQL[@]}" -c "INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, 'admin'::public.app_role FROM auth.users u
  WHERE u.id IN ('$ADMIN_A','$ADMIN_B')
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'admin')" > /dev/null

# ── Cenário 2: claim por alvo sob corrida ───────────────────────────────────

rm -f /tmp/team-conc-2a.out /tmp/team-conc-2b.out

"${PSQL[@]}" <<SQL > /tmp/team-conc-2a.out 2>&1 &
BEGIN;
SELECT public.team_begin_operation(
  '88888888-0000-0000-0000-000000000001', '$ADMIN_A', 'set_roles',
  NULL, '$TARGET', 'fp-conc');
SELECT pg_sleep(2);
COMMIT;
SQL
PID_A=$!

sleep 0.5

"${PSQL[@]}" <<SQL > /tmp/team-conc-2b.out 2>&1 &
BEGIN;
SELECT public.team_begin_operation(
  '88888888-0000-0000-0000-000000000002', '$ADMIN_A', 'set_roles',
  NULL, '$TARGET', 'fp-conc');
COMMIT;
SQL
PID_B=$!

wait "$PID_A" || true
wait "$PID_B" || true

ERRS=$(grep -l 'T0005\|em andamento' /tmp/team-conc-2a.out /tmp/team-conc-2b.out | wc -l | tr -d ' ')
STARTED=$("${PSQL[@]}" -c "SELECT count(*) FROM public.team_operations
  WHERE operation_id::text LIKE '88888888-%' AND status = 'started'")

[ "$ERRS" = "1" ] || fail "cenário 2: esperado exatamente 1 falha T0005, houve $ERRS"
[ "$STARTED" = "1" ] || fail "cenário 2: esperado exatamente 1 claim, há $STARTED"
echo "cenário 2 OK: claim por alvo sob corrida ficou com exatamente 1 operação"

echo "team-concurrency-check: TODOS os cenários OK"
