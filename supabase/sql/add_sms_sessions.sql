-- Run this AFTER schema.sql. Holds the last route-search result texted to
-- each phone number by sms-webhook, so a follow-up "1"/"2"/"3" reply can
-- pull up the chosen option's legs without recomputing (and without risking
-- a different traffic-driven ranking than what was actually texted).

create table sms_sessions (
  phone_number text primary key,
  origin jsonb not null,
  destination jsonb not null,
  search_result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

-- No RLS policies on purpose, same reasoning as passenger_waiting_state:
-- there's no auth on the SMS side, so this table is only ever touched via
-- the sms-webhook Edge Function's service-role client.
alter table sms_sessions enable row level security;

select cron.schedule(
  'clear-expired-sms-sessions',
  '*/15 * * * *',
  $$ delete from sms_sessions where expires_at < now(); $$
);
