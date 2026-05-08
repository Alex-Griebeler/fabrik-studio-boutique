# Agente de Faltas — Checklist de Produção

Tudo o que **você (Alex)** precisa fazer pra ligar o agente. Marque
conforme for executando.

---

## 0. Pré-requisitos do código (já feito)

- [x] Migration `attendance_alerts` + policies seeds
- [x] Edge function `detect-attendance-risk` (cron 22h)
- [x] Edge function `acknowledge-attendance-alert` (link público)
- [x] Edge function `escalate-attendance-alerts` (cron a cada 30min)
- [x] Config `verify_jwt = false` em `supabase/config.toml`
- [x] Lógica core com 27 testes passando (`npx vitest run`)
- [x] Doc de tom em `docs/agente-faltas-contexto.md`

---

## 1. Deploy do código

O Lovable faz auto-deploy quando você faz push pra `main`. Após o
push, confira no painel da Lovable que:

- A migration nova rodou (vai aparecer na lista de migrations)
- As 3 edge functions novas estão deployadas

---

## 2. Variáveis de ambiente (Supabase → Settings → Functions → Secrets)

As que **já devem existir** (porque `send-whatsapp` já funciona):
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_SANDBOX_NUMBER`

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são automáticos da plataforma.

**Conferir no painel** que as 3 acima estão preenchidas. Se não:
preencher antes de testar.

---

## 3. Configurar policies do agente (Supabase → SQL Editor)

Rodar este bloco **substituindo os valores marcados com `<<…>>`**:

```sql
-- Telefone que recebe TODOS os alertas em modo shadow.
-- Use seu número (Alex), formato E.164 sem espaços.
UPDATE public.policies
SET value = '"<<+55619XXXXXXXX>>"'::jsonb
WHERE key = 'attendance_agent.shadow_phone';

-- UUID da Raquel na tabela `trainers` (pra escalação após 24h).
-- Pega rodando: SELECT id, full_name FROM trainers WHERE full_name ILIKE '%raquel%';
UPDATE public.policies
SET value = '"<<UUID_DA_RAQUEL>>"'::jsonb
WHERE key = 'attendance_agent.fallback_trainer_id';

-- Confirma que estamos em SHADOW (já é o default, mas explícito).
UPDATE public.policies
SET value = '"shadow"'::jsonb
WHERE key = 'attendance_agent.mode';
```

Defaults razoáveis (mudar só se quiser):
- `silence_window_days` = 3
- `escalation_hours` = 24
- `lookback_days` = 14
- `send_window` = 9-19h, seg-sex
- `timezone` = America/Sao_Paulo

---

## 4. Conferir telefones dos treinadores

```sql
SELECT id, full_name, phone, is_active
FROM trainers
ORDER BY full_name;
```

Para cada treinador (JP, Diego, Felipe, Helio, Vinicius, Ingrid):
- [ ] `phone` está preenchido em E.164? (ex: `+5561988887777`)
- [ ] `is_active = true`?

Se faltar telefone, atualiza:
```sql
UPDATE trainers SET phone = '+5561XXXXXXXX' WHERE full_name = 'JP';
```

---

## 5. Smoke test em modo shadow (antes do cron rodar)

Antes do smoke, confira se a base tem presença suficiente para o
agente enxergar alguma coisa:

```sql
-- Sessões passadas ainda sem marcação: se isso estiver alto, o agente fica cego.
SELECT status, count(*)
FROM sessions
WHERE session_date >= current_date - interval '14 days'
  AND session_date < current_date
GROUP BY status
ORDER BY status;

-- Faltas registradas em turmas nos últimos 14 dias.
SELECT cb.status, count(*)
FROM class_bookings cb
JOIN sessions s ON s.id = cb.session_id
WHERE s.session_date >= current_date - interval '14 days'
  AND s.session_date < current_date
GROUP BY cb.status
ORDER BY cb.status;
```

Pegue a URL do projeto Supabase (Settings → API) e o `service_role`
key (Settings → API → secrets). Rodar do terminal:

```bash
SUPABASE_URL="https://hcfzqeutssngprldtymo.supabase.co"
SERVICE_KEY="<<service_role_key>>"

# Dry-run: detecta mas não grava nem envia
curl -X POST "$SUPABASE_URL/functions/v1/detect-attendance-risk" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

Resposta esperada:
```json
{
  "students_evaluated": 87,
  "alerts_detected": 3,
  "mode": "shadow",
  "in_send_window": true,
  "dry_run": true,
  ...
}
```

Se `alerts_detected > 0` mas você acha que ninguém faltou, é sinal
de que `sessions.no_show` ou `class_bookings.no_show` tem registro
incorreto. Investigar antes de seguir.

> Se usar `SELECT * FROM public._smoke_test_detect_attendance();`, a
> SQL function retorna só o `request_id` do `pg_net`; o JSON do detector
> precisa ser conferido nos logs da Edge Function. Para ver a resposta
> direto, prefira o `curl`.

---

## 6. Run real em shadow (envia pro **seu** WhatsApp)

```bash
# Sem dryRun. Cria alerts no DB e dispara WhatsApp pro shadow_phone.
curl -X POST "$SUPABASE_URL/functions/v1/detect-attendance-risk" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Você deve receber no WhatsApp **uma mensagem por aluno detectado**.
Se rodar fora da janela 9-19h, o alerta fica criado com
`notified_at = null` e será enviado no próximo run dentro da janela.

Confere a tabela:
```sql
SELECT id, student_id, alert_type, status, mode, message_to, notified_at
FROM attendance_alerts
ORDER BY created_at DESC
LIMIT 20;
```

Depois de um run dentro da janela, esta query deve voltar vazia:
```sql
SELECT id, student_id, status, mode, detected_at, notified_at, message_to
FROM attendance_alerts
WHERE status IN ('pending', 'escalated')
  AND notified_at IS NULL
ORDER BY detected_at;
```

Clica no link de cada mensagem → deve abrir página "Marcado como
tratado" e mudar o status pra `acknowledged` no banco.

---

## 7. Configurar pg_cron

**Os 3 crons são criados por migration versionada.** A migration
`supabase/migrations/20260508013356_attendance_agent_cron_secret.sql`
gera um segredo interno no banco, guarda em uma tabela restrita, e
recria os crons com o header `x-attendance-agent-cron-secret`.

A URL pública das edge functions
(`https://hcfzqeutssngprldtymo.functions.supabase.co/...`) fica
literal dentro de cada cron job. A autenticação do cron **não usa**
`app.settings.service_role_key`, porque o migration runner do Supabase
não tem permissão pra `ALTER DATABASE` nesse projeto.

**Pré-requisitos**:
- pg_cron e pg_net já estão instaladas (migration `20260304174221`)
- Edge Functions deployadas no commit que valida
  `x-attendance-agent-cron-secret`

**Validar depois da migration aplicada:**
```sql
-- Confere os 3 jobs criados
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname LIKE 'attendance-%'
ORDER BY jobname;

-- Confirma que o segredo interno foi gerado (sem mostrar valor)
SELECT EXISTS (
  SELECT 1
  FROM public.attendance_agent_runtime_config
  WHERE key = 'cron_secret'
    AND length(value) >= 64
) AS has_cron_secret;
```

Para **desligar** os crons depois (rollback manual):
```sql
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'attendance-detect-22h',
  'attendance-send-pending-9h',
  'attendance-escalate-30min'
);
```

---

## 8. Validação por 1 semana em shadow

Por uma semana, com cron rodando:

- [ ] O detector roda às 22h e cria alertas se houver aluno em risco
- [ ] Se o alerta nasceu fora da janela, ele é enviado no job das 9h
- [ ] Os alunos detectados batem com a realidade (não há falsos
      positivos por culpa de check-in não lançado)
- [ ] Os links de "marcado como tratado" funcionam
- [ ] A escalação após 24h sem ack está disparando (testa deixando
      um alerta sem clicar)
- [ ] Tasks pro treinador estão sendo criadas após o ack
- [ ] Após o job das 9h, não sobra alerta aberto com `notified_at IS NULL`

Se algo der errado nesta janela, ajustar **antes** de virar live.

---

## 9. Virar pra LIVE

Quando estiver tudo redondo:

```sql
UPDATE public.policies
SET value = '"live"'::jsonb
WHERE key = 'attendance_agent.mode';
```

A partir do próximo run do cron:
- Mensagens vão pro **treinador** (campo `trainers.phone`)
- Escalação vai pra Raquel
- Você sai do loop de notificações (a menos que algum treinador não
  tenha telefone — aí cai no fallback Raquel automaticamente)

Avisar a equipe **no dia anterior** que o agente está saindo de
shadow. Tom: "amanhã vocês começam a receber o alerta automático
quando aluno tiver 2 faltas seguidas — chega no WhatsApp. Mantém o
processo P3 normal, isso só ajuda a não perder ninguém."

---

## 10. Ligar/desligar de emergência

```sql
-- Pausar tudo (mantém crons mas suprime envios via janela impossível)
UPDATE public.policies
SET value = '{"start_hour": 0, "end_hour": 0, "days_of_week": []}'::jsonb
WHERE key = 'attendance_agent.send_window';

-- Voltar ao normal
UPDATE public.policies
SET value = '{"start_hour": 9, "end_hour": 19, "days_of_week": [1,2,3,4,5]}'::jsonb
WHERE key = 'attendance_agent.send_window';
```

Ou mais brutal: `cron.unschedule(...)`.

---

## 11. Integração EVO (fonte de verdade)

**EVO é a fonte oficial de presença.** O detector NÃO lê mais
`sessions`/`class_bookings` — ele lê da tabela
`attendance_events`, populada pelo sync EVO.

### 11.1 Arquitetura

```
EVO API  →  sync-evo-attendance (cron 21h40 SP)  →  attendance_events
                                                              ↓
                              detect-attendance-risk (cron 22h SP)
                                                              ↓
                                            attendance_alerts + WhatsApp
```

- `sync-evo-attendance` busca `GET /api/v1/activities/schedule` +
  `GET /api/v1/activities/schedule/detail` por dia, filtra aulas
  finalizadas (`statusName='Finalized'` ou `status=6`), normaliza
  enrollments via `_shared/attendance/evo-normalizer.ts` e faz
  upsert idempotente em `attendance_events` com
  `(source='evo', source_id='{idActivitySession}:{idMember}')`.
- O detector lê de `attendance_events` agnosticamente — funciona com
  qualquer `source` (`evo`, `internal_session`, `manual`).
- Cron de sync foi versionado (`20260508110238_attendance_evo_sync_cron.sql`)
  com body `{"dryRun": true}`. **Não escreve em produção até virar live.**

### 11.2 Mapping EVO → CRM

Duas tabelas resolvem identificadores:

- `evo_student_mappings(evo_member_id, student_id, match_method)`
  - método: `cpf` (preferencial), `email`, `manual`, `unmatched`
  - se sem match, fica `student_id=null` + `match_method='unmatched'`.
    Não cria aluno automático nesta fase.
  - em `dryRun=false`, o sync busca members EVO em lote, tenta casar
    CPF/email com `students`, grava mappings novos e só grava
    `attendance_events` para alunos mapeados.
- `evo_trainer_mappings(evo_employee_id, evo_instructor_name, trainer_id, match_method)`
  - amostra Fase 1 trouxe `idEmployee=null` em todos os enrollments,
    então fallback é match por `trainers.full_name` normalizado.

### 11.3 Status mapping confirmado (Fase 1, 20 enrollments reais)

| EVO | → `attendance_event_status` | Justificativa |
|---|---|---|
| `removed=true` | `ignore` | inscrição removida pré-aula |
| `suspended=true` | `ignore` | aluno suspenso |
| `replacement=true` | `ignore` | substituição na vaga |
| `justifiedAbsence=true` | `cancelled_on_time` | ausência justificada (não conta) |
| `status=0` | `present` | `count(status=0) == ocupation` em 100% das amostras |
| `status=1` | `no_show` | falta sem cancelamento |
| `status=2` | `ignore` | cancelamento sem timestamp confiável (conservador) |
| desconhecido | `ignore` | reportado em `summary.errors` |

Lógica isolada em `evo-normalizer.ts`, coberta pelos testes de
normalização/matching EVO.

### 11.4 Limites de plano EVO PLUS

Plano atual gratuito: **1.000 req/mês, 100/dia**.

Custo por sync diário em prod: 1 schedule + N details (1 por aula
finalizada). Pra ~31 aulas/dia = **32 reqs/dia ≈ 960/mês** — encosta
no limite. Margem zero.

**Recomendação antes de virar live**: upgrade pra API PRO
(R$ 39,90/mês fixos + R$ 2,72/100 reqs em horário comercial).
Desbloqueia webhook real-time também.

### 11.5 Como ligar a integração EVO

**Pré-requisitos manuais (Supabase → Settings → Functions → Secrets):**

```
EVO_API_BASE_URL = https://evo-integracao-api.w12app.com.br
EVO_DNS          = <dns da unidade>
EVO_TOKEN        = <token gerado no painel EVO → Integrações → API>
EVO_BRANCH_ID    = 1
EVO_SYNC_DRY_RUN = true        (não mudar até validar 1 semana)
```

E na tabela `attendance_agent_runtime_config`, garantir que existe a
chave `cron_secret` com um valor aleatório (mesmo secret consumido
pelos outros crons do agente):

```sql
SELECT key FROM attendance_agent_runtime_config WHERE key = 'cron_secret';
-- se vazio:
INSERT INTO attendance_agent_runtime_config (key, value)
VALUES ('cron_secret', encode(gen_random_bytes(32), 'hex'));
```

**Smoke test (dry-run) sem envolver cron:**

```bash
SUPABASE_URL="https://hcfzqeutssngprldtymo.supabase.co"
SERVICE_KEY="<<service_role_key>>"

# Sync 1 dia em dry-run (não escreve nada)
curl -X POST "$SUPABASE_URL/functions/v1/sync-evo-attendance" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-05-07", "dryRun": true, "limitDetails": 5}'
```

Esperado no JSON:
```json
{
  "dry_run": true,
  "date": "2026-05-07",
  "schedule_count": 45,
  "finalized_count": 31,
  "details_fetched": 5,
  "enrollments_seen": <N>,
  "present_count": <N>, "no_show_count": <N>, "ignored_count": <N>,
  "members_fetched": <N>,
  "mapped_students": <N>,
  "unmapped_students": <N>,
  "would_map_by_cpf": <N>,
  "would_map_by_email": <N>,
  "would_unmatched": <N>,
  "mapped_trainers": <N>, "unmapped_trainers": <N>,
  "upserted": 0,
  "errors": []
}
```

**Virar `dryRun=false`** (popula attendance_events com dados reais):

```bash
# Override em runtime via body do detector
curl -X POST "$SUPABASE_URL/functions/v1/sync-evo-attendance" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -d '{"date": "2026-05-07", "dryRun": false}'
```

Ou alterar a setting persistente:
```
Supabase → Functions → Secrets → EVO_SYNC_DRY_RUN = false
```

E ajustar o cron `attendance-evo-sync-21h40` pra body
`{"dryRun": false}` quando estiver pronto.

---

## Sintomas esperados nos primeiros dias

- Pode pegar 0 alertas se ninguém faltar — normal
- Pode pegar alertas "antigos" no primeiro run (até 14 dias de
  lookback) — eu pus o índice único pra um aluno só ter 1 alerta
  aberto, então não vai spammear
- Se um aluno foi detectado, foi tratado, e aí faltou de novo na mesma
  semana, o segundo alerta entra em "silence window" por 3 dias
  (configurável)
