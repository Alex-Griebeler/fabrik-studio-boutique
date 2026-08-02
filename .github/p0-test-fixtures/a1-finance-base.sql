-- Minimal production-contract fixture for the A1 finance migration tests.
-- Used only by GitHub Actions in an ephemeral Supabase project.
-- The three intentionally legacy jobs model the state the migration must
-- rewrite without changing names, schedules, targets, or literal JSON bodies.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
  'fixture-daily-finance',
  '40 21 * * *',
  $job$
    SELECT net.http_post(
      url := 'https://hcfzqeutssngprldtymo.functions.supabase.co/daily-finance-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer fixture-legacy-token'
      ),
      body := '{"source":"fixture","dryRun":false}'::jsonb
    );
  $job$
);

SELECT cron.schedule(
  'fixture-monthly-invoices',
  '5 8 1 * *',
  $job$
    SELECT net.http_post(
      url := 'https://hcfzqeutssngprldtymo.functions.supabase.co/generate-monthly-invoices',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer fixture-legacy-token'
      ),
      body := '{"source":"fixture","validateOnly":true}'::jsonb
    );
  $job$
);

-- Exercise the two-argument pg_cron overload too: this job starts unnamed and
-- must receive a deterministic, collision-safe name during the rewrite.
SELECT cron.schedule(
  '10 2 * * *',
  $job$
    SELECT net.http_post(
      url := 'https://hcfzqeutssngprldtymo.functions.supabase.co/calculate-invoice-penalties',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer fixture-legacy-token'
      ),
      body := '{"source":"fixture","apply":false}'::jsonb
    );
  $job$
);
