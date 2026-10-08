-- Run this AFTER schema.sql and add_sms_log.sql, in the cloud SQL Editor.
--
-- Backs the hackathon demo stage (/demo/stage). Two pieces:
--
-- 1) demo_commands — a tiny queue the browser writes to and the Node fleet
--    simulator polls. Needed because two presenter levers cannot run from a
--    browser at all: "throw traffic at a unit" has to move a driver, which
--    only the process holding that driver's session can do; and "send the
--    demo SMS" has to sign an HMAC with TEXTBEE_WEBHOOK_SECRET, which must
--    never ship to a client. Everything else the presenter bar does (surge,
--    clear, capacity toggle) goes straight to the existing edge functions
--    and never touches this table.
--
-- 2) get_demo_sms_log — a narrow read-only window onto sms_log so the stage
--    can render the SMS thread. sms_log deliberately has no read policy
--    (add_sms_log.sql) and that stays true; this function is SECURITY
--    DEFINER and scoped to a single phone number, so it cannot be used to
--    enumerate the table.

create table if not exists demo_commands (
  id uuid primary key default gen_random_uuid(),
  type text not null check (
    type in ('slow', 'resume', 'idle', 'leave', 'return', 'lining_up', 'skip_temp', 'skip_done', 'send_sms')
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

-- Keep this migration safe to re-run after the original table was created.
alter table demo_commands drop constraint if exists demo_commands_type_check;
alter table demo_commands add constraint demo_commands_type_check
  check (
    type in ('slow', 'resume', 'idle', 'leave', 'return', 'lining_up', 'skip_temp', 'skip_done', 'send_sms')
  );

-- The simulator's poll is "unconsumed, oldest first".
create index if not exists idx_demo_commands_pending
  on demo_commands (created_at)
  where consumed_at is null;

alter table demo_commands enable row level security;

-- Anon insert + select only: the stage enqueues and reflects status.
-- Consumption (the update that sets consumed_at) is done by the simulator
-- with the service-role key, so no update policy is granted here.
drop policy if exists "demo commands public insert" on demo_commands;
create policy "demo commands public insert" on demo_commands for insert with check (true);

drop policy if exists "demo commands public select" on demo_commands;
create policy "demo commands public select" on demo_commands for select using (true);

-- Reads back what textbee.ts logged for one number. Ordered oldest-first so
-- the stage can render it as a chat thread directly. `simulated` is exposed
-- so the UI can badge it honestly when no TextBee device is attached.
create or replace function get_demo_sms_log(
  p_phone text,
  p_limit integer default 40
) returns table (
  id uuid,
  message text,
  simulated boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, message, simulated, created_at
    from (
      select id, message, simulated, created_at
        from sms_log
       where mobile_number = p_phone
       order by created_at desc
       limit greatest(1, least(coalesce(p_limit, 40), 200))
    ) recent
   order by created_at asc;
$$;

grant execute on function get_demo_sms_log(text, integer) to anon, authenticated;

-- Housekeeping: demo commands are ephemeral. Clear anything older than a day
-- so repeated rehearsals don't accumulate rows.
delete from demo_commands where created_at < now() - interval '1 day';
