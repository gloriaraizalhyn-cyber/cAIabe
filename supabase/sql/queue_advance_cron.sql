-- Automates queue-advance so it runs on its own, instead of only firing
-- when something manually calls it (like your simulator has been doing).
-- Run this in your CLOUD project's SQL Editor.

create extension if not exists pg_cron;
create extension if not exists pg_net; -- lets Postgres make outbound HTTP calls

-- Schedules queue-advance to run every minute. pg_cron's standard syntax is
-- minute-level at minimum — some pg_cron versions support finer intervals
-- like '30 seconds', but that support varies by environment, so this starts
-- with the reliable, well-supported option. Every-minute is a reasonable
-- starting responsiveness for a queue system; tighten later if needed (see
-- note at the bottom of this file).
select cron.schedule(
  'queue-advance-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://hprgaaynsucaguzlcndd.supabase.co/functions/v1/queue-advance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcmdhYXluc3VjYWd1emxjbmRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDY4MDUsImV4cCI6MjEwMjYyMjgwNX0.d2lKpZpTUEEcBxmqu1trZuejAgQ4q5icQrpHojgSyCY',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcmdhYXluc3VjYWd1emxjbmRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDY4MDUsImV4cCI6MjEwMjYyMjgwNX0.d2lKpZpTUEEcBxmqu1trZuejAgQ4q5icQrpHojgSyCY'
    ),
    body := '{}'::jsonb
  );
  $$
);
-- NOTE: both apikey AND Authorization headers are required — Supabase's
-- Edge Functions gateway rejects requests missing Authorization with a 401
-- (UNAUTHORIZED_NO_AUTH_HEADER), even though queue-advance's own code
-- doesn't check auth. This tripped us up on first setup — don't drop it.

-- ==========================================================
-- Useful queries for checking it's actually working
-- ==========================================================

-- See your scheduled job(s):
-- select * from cron.job;

-- See execution history (did it run, did it succeed):
-- select * from cron.job_run_details order by start_time desc limit 20;

-- See the actual HTTP responses pg_net got back from your function
-- (useful for debugging if queue-advance itself errors):
-- select * from net._http_response order by created desc limit 20;

-- To stop/replace this schedule later:
-- select cron.unschedule('queue-advance-every-minute');

-- ==========================================================
-- OPTIONAL: tighter interval, if your pg_cron version supports it
-- ==========================================================
-- Some pg_cron versions accept an interval string directly instead of cron
-- syntax. If the standard schedule above works, you can try replacing it
-- with a 15-30 second interval for tighter responsiveness:
--
-- select cron.unschedule('queue-advance-every-minute');
-- select cron.schedule(
--   'queue-advance-every-30s',
--   '30 seconds',
--   $$ select net.http_post( ... same body as above ... ); $$
-- );
--
-- If this errors ("invalid input syntax"), your pg_cron version doesn't
-- support sub-minute scheduling — just keep the every-minute version above.