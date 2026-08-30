-- Run this AFTER schema.sql. Adds a log of every SMS attempt sent by
-- textbee.ts, real or simulated, so the passenger SMS trip planner
-- (sms-webhook) is demoable without needing a live TextBee-connected phone.
--
-- driver_id is nullable and always null for the passenger flow (kept for a
-- possible future driver-facing use of the same sendSms helper); there is
-- currently no driver-facing SMS feature, so nothing selects driver_id rows
-- from this table today.

create table sms_log (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references drivers(id) on delete cascade,
  mobile_number text not null,
  message text not null,
  simulated boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_sms_log_driver_created on sms_log (driver_id, created_at desc);

alter table sms_log enable row level security;

-- No driver-facing read policy — nothing currently reads this table back;
-- it exists purely as an audit trail. Writes go through sms-webhook's
-- service-role client, so no insert policy is needed either.
