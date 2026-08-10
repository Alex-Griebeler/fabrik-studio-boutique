#!/usr/bin/env bash
# T1 — mutantes NORMATIVOS do handler (spec §2.3): cada mutação reintroduz um
# defeito que a suíte TEM que matar. Se algum mutante sobreviver (vitest verde),
# o script falha. Restaura por BACKUP DE ARQUIVO (cp) — NUNCA git checkout,
# que apaga trabalho não commitado (lição registrada da casa).
set -euo pipefail

TARGET="supabase/functions/_shared/team/manageTeam.ts"
TESTS="supabase/functions/_shared/team"

BACKUP="$(mktemp)"
cp "$TARGET" "$BACKUP"
trap 'cp "$BACKUP" "$TARGET"' EXIT

run_mutant() {
  local name="$1"; local py="$2"
  python3 -c "$py"
  if npx vitest run "$TESTS" --reporter=dot > /tmp/mutant-out.txt 2>&1; then
    echo "MUTANTE SOBREVIVEU: $name"; tail -5 /tmp/mutant-out.txt; cp "$BACKUP" "$TARGET"; exit 1
  fi
  cp "$BACKUP" "$TARGET"
  echo "mutante morto: $name"
}

run_mutant "M1 verificação de proveniência removida" "
s=open('$TARGET').read()
s=s.replace('return reread.data.user.app_metadata?.team_operation_id === operationId;','return true;')
open('$TARGET','w').write(s)"

run_mutant "M2 student na allowlist de staff" "
s=open('$TARGET').read()
s=s.replace('export const STAFF_ROLES = [\"admin\", \"manager\", \"reception\", \"instructor\"] as const;','export const STAFF_ROLES = [\"admin\", \"manager\", \"reception\", \"instructor\", \"student\"] as const;')
open('$TARGET','w').write(s)"

run_mutant "M3 reconciliação dá papel sem a marca" "
s=open('$TARGET').read()
s=s.replace('if (found.app_metadata?.team_operation_id !== operationId) {','if (false) {')
open('$TARGET','w').write(s)"

run_mutant "M4 e-mail existente ganharia convite" "
s=open('$TARGET').read()
s=s.replace('if (existing !== null) {','if (false) {')
open('$TARGET','w').write(s)"

echo "team-mutants: todos os mutantes mortos"
