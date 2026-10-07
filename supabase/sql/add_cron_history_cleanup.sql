-- Run in your cloud SQL Editor, after queue_advance_cron.sql. Safe to re-run.
--
-- pg_cron logs every single job run to cron.job_run_details and never
-- prunes it. With queue-advance firing every minute (every 15s before
-- that) plus the two 15-minute cleanup jobs, that log reached 348 MB —
-- ~86% of the Free plan's 0.5 GB database limit — while every app table
-- combined was only a few MB. Nothing in the app reads this table; it's
-- debugging history only.
--
-- One-time cleanup (truncate returns the disk space immediately; a plain
-- delete would leave it allocated until a vacuum full):
--
--   truncate cron.job_run_details;
--
-- Then this job keeps it bounded: nightly at 03:00 Asia/Manila (19:00 UTC,
-- pg_cron schedules are in UTC), drop run history older than a day. A day
-- is enough to debug queue-advance with the queries in
-- queue_advance_cron.sql.

select cron.unschedule(jobname) from cron.job
where jobname = 'purge-cron-run-history';

select cron.schedule(
  'purge-cron-run-history',
  '0 19 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '1 day'; $$
);

-- Check it:
-- select jobname, schedule, active from cron.job order by jobname;
-- select pg_size_pretty(pg_total_relation_size('cron.job_run_details'));
