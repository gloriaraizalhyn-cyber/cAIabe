-- Automates queue-advance so it runs on its own, instead of only firing
-- when something manually calls it (like your simulator has been doing).
-- Run this in your CLOUD project's SQL Editor.

create extension if not exists pg_cron;
create extension if not exists pg_net; -- lets Postgres make outbound HTTP calls

-- Drop any earlier version of this job (safe to re-run; no-op if absent).
select cron.unschedule(jobname) from cron.job
where jobname in ('queue-advance-every-15s', 'queue-advance-every-minute');

-- Schedules queue-advance once per minute. Realtime broadcasts and FCM
-- notifications keep the UI responsive; this job is only the server-side
-- fallback and queue promotion sweep.
--
-- EGRESS GUARD: the HTTP call only fires while some queue entry is active.
-- Every step in queue-advance filters on these three statuses, so with none
-- present a run does nothing — but it still made 53 REST round-trips (1 +
-- 4 per route), each billed as egress. Unguarded at 15s that was ~310 MB/day
-- with nobody using the app. The EXISTS check runs inside Postgres, so an
-- idle tick now costs zero egress.
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
  )
  where exists (
    select 1 from public.queue_entries
    where status in ('waiting', 'next_to_go', 'temporarily_away')
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
-- Pausing the whole driver queue (while not developing)
-- ==========================================================
-- Two halves, both reversible. Resume both before a demo.
--
-- Pause:
--   select cron.alter_job((select jobid from cron.job where jobname = 'queue-advance-every-minute'), active := false);
--   supabase secrets set QUEUE_PAUSED=true      (driver-queue-join then returns 503)
--
-- Resume:
--   select cron.alter_job((select jobid from cron.job where jobname = 'queue-advance-every-minute'), active := true);
--   supabase secrets unset QUEUE_PAUSED