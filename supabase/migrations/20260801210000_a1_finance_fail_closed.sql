-- A1: tornar as edge functions financeiras fail-closed.
--
-- As tres funcoes (`daily-finance-cron`, `generate-monthly-invoices`,
-- `calculate-invoice-penalties`) sao `verify_jwt = false` e ate agora so
-- checavam credencial QUANDO o header Authorization existia. Chamada sem
-- header nenhum executava escrita financeira. O codigo desta branch passa a
-- exigir credencial; esta migration entrega o outro lado: o segredo que o
-- pg_cron usa para continuar chamando.
--
-- Escopo deliberado desta migration:
--   * cria `public.finance_runtime_config` (aditiva, idempotente);
--   * gera o segredo DENTRO do banco — nenhum literal fica versionado;
--   * reaponta os jobs financeiros JA EXISTENTES para mandar o header,
--     preservando jobname, schedule e body original de cada um.
--
-- Regra suportada e fail-closed transacional:
--   * suportado = job cujo comando usa `net.http_post` e cuja clausula
--     `headers` e um literal SQL convertido para jsonb, seguida de `body :=`,
--     OU job que ja contem o contrato seguro gerado por esta migration;
--   * a migration troca SOMENTE essa clausula de headers no comando original.
--     URL, body (inclusive expressoes dinamicas com `now()`) e todo o sufixo
--     permanecem byte a byte como estavam;
--   * qualquer outra forma de invocacao => RAISE EXCEPTION. Pular o job o
--     deixaria tomando 401 em silencio depois do deploy;
--   * headers dinamicos ou em formato desconhecido => RAISE EXCEPTION. Nao e
--     seguro tentar editar uma expressao arbitraria;
--   * as duas validacoes rodam ANTES do primeiro unschedule. Combinadas com a
--     transacao da migration, garantem tudo-ou-nada: nenhum job fica
--     parcialmente reagendado;
--   * job com jobname NULL (forma de 2 argumentos do cron.schedule) recebe
--     nome deterministico `finance-<funcao>`, o que mantem a idempotencia.
--
-- O que ela NAO faz, por decisao: criar job que nao existe. Nenhuma migration
-- deste repo registra o cron financeiro (ele foi criado fora do versionamento),
-- entao inventar um `cron.schedule` aqui significaria ligar escrita financeira
-- periodica em producao a partir de um palpite. Se o loop abaixo nao encontrar
-- nada, nada e agendado — e o RAISE NOTICE deixa isso explicito no log.

CREATE TABLE IF NOT EXISTS public.finance_runtime_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finance_runtime_config IS
  'Config de runtime das edge functions financeiras. Contem o cron_secret; nunca expor ao cliente.';

ALTER TABLE public.finance_runtime_config ENABLE ROW LEVEL SECURITY;

-- Sem policy alguma + RLS ligada => nem anon nem authenticated leem, mesmo
-- que um GRANT futuro escape. O service_role bypassa RLS por definicao.
REVOKE ALL ON TABLE public.finance_runtime_config FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.finance_runtime_config TO service_role;

INSERT INTO public.finance_runtime_config (key, value, description)
VALUES (
  'cron_secret',
  lower(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  'Segredo interno usado pelo pg_cron para autenticar chamadas das funcoes financeiras.'
)
ON CONFLICT (key) DO NOTHING;

-- Reagendamento seguro.
--
-- O jobname do cron financeiro nao esta no repo, entao a selecao e feita pela
-- URL alvo: pega exatamente jobs que fazem net.http_post para uma das tres
-- funcoes em escopo. Attendance, nurturing e churn nao casam com nenhum
-- desses padroes e ficam intocados.
--
-- Cada job e recriado com o MESMO nome e o MESMO schedule; muda so o comando,
-- que passa a montar o header via COALESCE((SELECT value ...), ''). O segredo
-- nunca e materializado em `cron.job.command` — e lido no momento do disparo.
-- Efeito colateral desejado: qualquer JWT literal que estivesse no comando
-- antigo sai de `cron.job`.
--
-- Idempotente: rodar de novo encontra os mesmos jobs e reescreve identico.
DO $migration$
DECLARE
  finance_jobs jsonb;
  finance_job jsonb;
  target_function text;
  job_name text;
  rewritten_command text;
  offending text;
  rewritten integer := 0;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'A1: pg_cron indisponivel; nenhum job financeiro reagendado.';
    RETURN;
  END IF;

  -- Snapshot antes de mexer: o loop altera cron.job, entao iterar direto sobre
  -- a tabela misturaria leitura e escrita na mesma relacao.
  --
  -- A selecao e por URL alvo e NAO exige net.http_post de proposito: um job
  -- financeiro com outra forma de invocacao precisa entrar no snapshot para
  -- ser reportado no loop, em vez de sumir silenciosamente do filtro.
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'jobid', jobid,
      'jobname', jobname,
      'schedule', schedule,
      'command', command
    )),
    '[]'::jsonb
  )
  INTO finance_jobs
  FROM cron.job
  WHERE command LIKE '%/daily-finance-cron%'
     OR command LIKE '%/generate-monthly-invoices%'
     OR command LIKE '%/calculate-invoice-penalties%';

  -- ── Passagem 1: validacao. Nenhum estado efetivo ainda. ──────────────────
  --
  -- Fail-closed transacional: se existir job financeiro que esta migration
  -- nao sabe reescrever com fidelidade, ela ABORTA. Nada de meio-termo — um
  -- job pulado viraria 401 silencioso em producao depois do deploy, e um body
  -- substituido por '{}' seria mudanca de payload nao autorizada. Como a
  -- validacao roda antes do primeiro unschedule, e como a migration e
  -- transacional, o EXCEPTION reverte inclusive jobs ja reagendados.

  SELECT string_agg(COALESCE(job->>'jobname', '<sem nome>'), ', ')
  INTO offending
  FROM jsonb_array_elements(finance_jobs) AS job
  WHERE job->>'command' NOT ILIKE '%net.http_post%';

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'A1: job(s) financeiro(s) com forma de invocacao nao suportada: %', offending
      USING HINT =
        'A migration so reescreve net.http_post. Ajuste o job manualmente (ou estenda esta migration) antes de aplicar, senao ele passaria a receber 401.';
  END IF;

  SELECT string_agg(COALESCE(job->>'jobname', '<sem nome>'), ', ')
  INTO offending
  FROM jsonb_array_elements(finance_jobs) AS job
  WHERE substring(
      job->>'command'
      from $re$headers\s*:=\s*('(?:[^']|'')*')\s*::\s*jsonb\s*,\s*body\s*:=$re$
    ) IS NULL
    AND NOT (
      job->>'command' ILIKE '%x-finance-cron-secret%'
      AND job->>'command' LIKE '%public.finance_runtime_config%'
      AND job->>'command' ILIKE '%COALESCE%'
      AND job->>'command' NOT ILIKE '%authorization%'
      AND job->>'command' ~* $re$body\s*:=$re$
    );

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'A1: job(s) financeiro(s) com clausula de headers nao suportada: %', offending
      USING HINT =
        'A migration substitui somente headers em literal SQL convertido para jsonb e preserva o body original. Normalize os headers antes de aplicar; ela nao tenta editar expressoes arbitrarias.';
  END IF;

  -- ── Passagem 1c: contexto de execucao. ──────────────────────────────
  --
  -- cron.schedule registra o job recriado como ATIVO, pertencente ao usuario
  -- e database da sessao corrente. Para job que sera de fato reescrito, isso
  -- reativaria um job pausado ou trocaria o executor em silencio. Fail-closed:
  -- aborta antes do primeiro unschedule. Job ja seguro fica fora da guarda
  -- porque a passagem 2 o pula sem recriar (CONTINUE), preservando tudo.
  SELECT string_agg(COALESCE(jobname, '<sem nome>'), ', ')
  INTO offending
  FROM cron.job
  WHERE (
      command LIKE '%/daily-finance-cron%'
      OR command LIKE '%/generate-monthly-invoices%'
      OR command LIKE '%/calculate-invoice-penalties%'
    )
    AND NOT (
      command ILIKE '%x-finance-cron-secret%'
      AND command LIKE '%public.finance_runtime_config%'
      AND command ILIKE '%COALESCE%'
      AND command NOT ILIKE '%authorization%'
      AND command ~* $re$body\s*:=$re$
    )
    AND (NOT active OR username <> current_user OR database <> current_database());

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'A1: job(s) financeiro(s) inativo(s) ou de outro usuario/database: %', offending
      USING HINT =
        'Recriar este job mudaria active/username/database em silencio. Reative ou ajuste o job manualmente (ou estenda esta migration) antes de aplicar.';
  END IF;

  -- ── Passagem 2: reescrita. Aqui todo job do snapshot ja e suportado. ─────
  FOR finance_job IN SELECT * FROM jsonb_array_elements(finance_jobs)
  LOOP
    target_function := CASE
      WHEN finance_job->>'command' LIKE '%/daily-finance-cron%'
        THEN 'daily-finance-cron'
      WHEN finance_job->>'command' LIKE '%/generate-monthly-invoices%'
        THEN 'generate-monthly-invoices'
      ELSE 'calculate-invoice-penalties'
    END;

    -- `cron.job.jobname` e nullable (job criado pela forma de 2 argumentos do
    -- cron.schedule). Sem nome nao da para reagendar, entao adota um nome
    -- deterministico que inclui o jobid de origem.
    --
    -- O jobid entra por seguranca, nao por estilo: `cron.schedule(name, ...)`
    -- ATUALIZA o job quando o nome ja existe. Um nome so por funcao colidiria
    -- entre dois jobs sem nome da mesma funcao (o segundo sobrescreveria o
    -- primeiro, perdendo um agendamento em silencio) ou com um job homonimo
    -- ja existente. Com o jobid o nome e unico por origem, e a idempotencia
    -- continua valendo: na proxima execucao o job ja tem esse nome e e
    -- reescrito igual.
    job_name := COALESCE(
      NULLIF(btrim(finance_job->>'jobname'), ''),
      'finance-' || target_function || '-' || (finance_job->>'jobid')
    );

    -- Idempotencia estrita: se o job ja tem exatamente os marcadores do
    -- contrato seguro produzido abaixo, nao altera nem mesmo o jobid.
    IF finance_job->>'command' ILIKE '%x-finance-cron-secret%'
       AND finance_job->>'command' LIKE '%public.finance_runtime_config%'
       AND finance_job->>'command' ILIKE '%COALESCE%'
       AND finance_job->>'command' NOT ILIKE '%authorization%'
       AND finance_job->>'command' ~* $re$body\s*:=$re$
    THEN
      rewritten := rewritten + 1;
      RAISE NOTICE 'A1: job "%" ja possui headers financeiros seguros; nenhuma alteracao',
        job_name;
      CONTINUE;
    END IF;

    -- Reescreve somente a clausula de headers do comando original. O regex
    -- consome ate o marcador `body :=` e o reemite; todo o texto posterior
    -- (a expressao do body, eventual AS request_id e ponto-e-virgula) nao
    -- participa do match e permanece byte a byte. A passagem 1 garante que
    -- existe exatamente a forma suportada antes de qualquer unschedule.
    rewritten_command := regexp_replace(
      finance_job->>'command',
      $re$headers\s*:=\s*'(?:[^']|'')*'\s*::\s*jsonb\s*,\s*body\s*:=$re$,
      $headers$headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-finance-cron-secret',
            COALESCE((SELECT value FROM public.finance_runtime_config WHERE key = 'cron_secret'), '')
          ),
          body :=$headers$,
      'i'
    );

    IF rewritten_command = finance_job->>'command'
       OR rewritten_command ILIKE '%authorization%'
       OR rewritten_command NOT LIKE '%public.finance_runtime_config%'
    THEN
      RAISE EXCEPTION
        'A1: reescrita de headers nao produziu o contrato seguro para o job "%"', job_name;
    END IF;

    PERFORM cron.unschedule((finance_job->>'jobid')::bigint);

    -- Os headers foram reconstruidos do zero no proprio comando. Qualquer
    -- Authorization legado deixa de existir; URL e body permanecem intactos.
    PERFORM cron.schedule(
      job_name,
      finance_job->>'schedule',
      rewritten_command
    );

    rewritten := rewritten + 1;
    RAISE NOTICE 'A1: job "%" (schedule %) reapontado para %; comando preservado fora dos headers',
      job_name, finance_job->>'schedule', target_function;
  END LOOP;

  IF rewritten = 0 THEN
    RAISE NOTICE 'A1: nenhum job financeiro encontrado em cron.job; nada agendado (por decisao).';
  END IF;
END
$migration$;
