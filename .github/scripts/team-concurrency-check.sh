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
# O ator das RPCs é auth.uid(): toda sessão do harness "é" o admin A.
CLAIMS="SELECT set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}', false);"

ADMIN_A='00000000-0000-0000-0000-00000000000a'
ADMIN_B='00000000-0000-0000-0000-00000000000b'
TARGET='00000000-0000-0000-0000-00000000000c'

# Auto-contenção: execuções anteriores (harness/mutantes) podem ter deixado
# operações started com lease vivo — expira tudo para os claims não vazarem
# entre execuções. Op ids são SEMPRE aleatórios pelo mesmo motivo.
"${PSQL[@]}" -c "UPDATE public.team_operations
  SET lease_expires_at = now() - interval '1 second'
  WHERE status = 'started'" > /dev/null
OP2A=$(uuidgen | tr 'A-Z' 'a-z'); OP2B=$(uuidgen | tr 'A-Z' 'a-z')
OP3A=$(uuidgen | tr 'A-Z' 'a-z'); OP3B=$(uuidgen | tr 'A-Z' 'a-z')

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
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
SELECT public.team_begin_operation(
  '$OP2A', 'set_roles',
  NULL, '$TARGET', 'fp-conc');
SELECT pg_sleep(2);
COMMIT;
SQL
PID_A=$!

sleep 0.5

"${PSQL[@]}" <<SQL > /tmp/team-conc-2b.out 2>&1 &
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
SELECT public.team_begin_operation(
  '$OP2B', 'set_roles',
  NULL, '$TARGET', 'fp-conc');
COMMIT;
SQL
PID_B=$!

wait "$PID_A" || true
wait "$PID_B" || true

ERRS=$(grep -l 'T0005\|em andamento' /tmp/team-conc-2a.out /tmp/team-conc-2b.out | wc -l | tr -d ' ')
STARTED=$("${PSQL[@]}" -c "SELECT count(*) FROM public.team_operations
  WHERE operation_id IN ('$OP2A','$OP2B') AND status = 'started'
    AND lease_expires_at >= now()")

[ "$ERRS" = "1" ] || fail "cenário 2: esperado exatamente 1 falha T0005, houve $ERRS"
[ "$STARTED" = "1" ] || fail "cenário 2: esperado exatamente 1 claim, há $STARTED"
echo "cenário 2 OK: claim por alvo sob corrida ficou com exatamente 1 operação"

# o claim vivo do cenário 2 não pode vazar pro 3 (mesmo alvo+ação)
"${PSQL[@]}" -c "UPDATE public.team_operations
  SET lease_expires_at = now() - interval '1 second'
  WHERE status = 'started'" > /dev/null


# ── Cenário 3: set_roles × set_roles CONCORRENTES (alvos distintos — no mesmo
# alvo o claim T0005 já barra no begin, provado no cenário 2). Aqui NADA pode
# falhar: as duas RPCs devem completar, ambas as operações terminarem em
# role_assigned e os dois estados finais baterem exatamente.

rm -f /tmp/team-conc-3a.out /tmp/team-conc-3b.out

TARGET_B='00000000-0000-0000-0000-00000000000d'   # aluna (student intocável)

TOK_A=$("${PSQL[@]}" -c "$CLAIMS SELECT (public.team_begin_operation(
  '$OP3A', 'set_roles',
  NULL, '$TARGET', 'fp-c3a')) ->> 'lease_token'" | tail -1)
TOK_B=$("${PSQL[@]}" -c "$CLAIMS SELECT (public.team_begin_operation(
  '$OP3B', 'set_roles',
  NULL, '$TARGET_B', 'fp-c3b')) ->> 'lease_token'" | tail -1)

"${PSQL[@]}" <<SQL > /tmp/team-conc-3a.out 2>&1 &
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
SELECT public.team_set_roles('$OP3A',
  '$TOK_A', ARRAY['instructor','manager']::public.app_role[]);
SQL
PID_A=$!
"${PSQL[@]}" <<SQL > /tmp/team-conc-3b.out 2>&1 &
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
SELECT public.team_set_roles('$OP3B',
  '$TOK_B', ARRAY['reception']::public.app_role[]);
SQL
PID_B=$!
wait "$PID_A"; RA=$?
wait "$PID_B"; RB=$?

[ "$RA" = "0" ] && [ "$RB" = "0" ] || {
  cat /tmp/team-conc-3a.out /tmp/team-conc-3b.out
  fail "cenário 3: uma das set_roles falhou (exit $RA/$RB)"; }
grep -q "ERROR" /tmp/team-conc-3a.out /tmp/team-conc-3b.out && {
  cat /tmp/team-conc-3a.out /tmp/team-conc-3b.out
  fail "cenário 3: ERROR na saída"; }

PHASES=$("${PSQL[@]}" -c "SELECT count(*) FROM public.team_operations
  WHERE operation_id IN ('$OP3A','$OP3B') AND phase = 'role_assigned'")
[ "$PHASES" = "2" ] || fail "cenário 3: esperadas 2 operações em role_assigned, há $PHASES"

FINAL_A=$("${PSQL[@]}" -c "SELECT array_agg(role ORDER BY role)::text
  FROM public.user_roles WHERE user_id = '$TARGET'")
FINAL_B=$("${PSQL[@]}" -c "SELECT array_agg(role ORDER BY role)::text
  FROM public.user_roles WHERE user_id = '$TARGET_B'")
[ "$FINAL_A" = "{instructor,manager}" ] || fail "cenário 3: alvo A terminou $FINAL_A"
[ "$FINAL_B" = "{reception,student}" ] || fail "cenário 3: alvo B terminou $FINAL_B (student deve FICAR)"
echo "cenário 3 OK: duas set_roles concorrentes, ambas completas, estados exatos"

echo "team-concurrency-check: TODOS os cenários OK"
