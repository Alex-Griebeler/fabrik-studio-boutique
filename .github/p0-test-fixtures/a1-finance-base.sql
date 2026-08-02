-- Minimal production-contract fixture for the A1 finance migration tests.
-- Used only by GitHub Actions in an ephemeral Supabase project.
-- The three intentionally legacy jobs model the production command shape:
-- JSON-literal headers plus a dynamic body built with concat(..., now(), ...).
-- The migration must replace only the headers and preserve everything else.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
  'fixture-daily-finance',
  '40 21 * * *',
  $job$
    SELECT net.http_post(
      url := 'https://hcfzqeutssngprldtymo.functions.supabase.co/daily-finance-cron',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer fixture-legacy-token"}'::jsonb,
      body := concat('{"source":"fixture","triggered_at":"', now(), '","dryRun":false}')::jsonb
    ) AS request_id;
  $job$
);

SELECT cron.schedule(
  'fixture-monthly-invoices',
  '5 8 1 * *',
  $job$
    SELECT net.http_post(
      url := 'https://hcfzqeutssngprldtymo.functions.supabase.co/generate-monthly-invoices',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer fixture-legacy-token"}'::jsonb,
      body := concat('{"source":"fixture","triggered_at":"', now(), '","validateOnly":true}')::jsonb
    ) AS request_id;
  $job$
);

-- Exercise the two-argument pg_cron overload too: this job starts unnamed and
-- must receive a deterministic, collision-safe name during the rewrite.
SELECT cron.schedule(
  '10 2 * * *',
  $job$
    SELECT net.http_post(
      url := 'https://hcfzqeutssngprldtymo.functions.supabase.co/calculate-invoice-penalties',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer fixture-legacy-token"}'::jsonb,
      body := concat('{"source":"fixture","triggered_at":"', now(), '","apply":false}')::jsonb
    ) AS request_id;
  $job$
);
