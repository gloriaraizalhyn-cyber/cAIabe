-- Run this AFTER schema.sql. Adds a log of every SMS fallback attempt
-- (queue-advance's "notify next-2 driver" path, textbee.ts), real or
-- simulated, so the driver dashboard can show it without needing a live
-- TextBee-connected phone during a demo.

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

-- Mirrors "driver reads own row" on drivers — a driver can only see their
-- own SMS fallback history. Writes go through queue-advance's service-role
-- client, so no insert policy is needed here.
create policy "driver reads own sms_log" on sms_log
  for select using (driver_id = auth.uid());
