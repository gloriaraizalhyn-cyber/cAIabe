-- Run in your cloud SQL Editor. Adds an admin allowlist and lets admins
-- read/update every row in `drivers` (normally RLS-scoped to "own row
-- only") so the admin dashboard can review and approve/reject pending
-- driver applications. There's no self-serve admin signup on purpose —
-- after someone signs up an account the normal way (e.g. via the driver
-- login flow's auth, or any Supabase Auth sign-up), promote them to admin
-- by hand:
--
--   insert into admins (id) values ('<their auth.users id>');

create table if not exists admins (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;

-- Lets the frontend check "am I an admin" for its own logged-in user.
-- This is a convenience for the UI only — the edge functions below are
-- the actual enforcement point and re-check admin status server-side
-- with the service role, since client-side RLS alone can't be trusted
-- to gate the sensitive reads/writes those functions perform.
create policy "admins read own row" on admins
  for select using (auth.uid() = id);

-- Admins can read and update every driver, not just their own row.
create policy "admins read all drivers" on drivers
  for select using (exists (select 1 from admins where id = auth.uid()));

create policy "admins update all drivers" on drivers
  for update using (exists (select 1 from admins where id = auth.uid()));

-- First admin account: adm@admin.com, created via the app's own sign-up
-- API (auth.users id below). Promotes it so it can log in at /admin/login.
insert into admins (id) values ('22cc1d46-481c-4b71-a8f7-c3404c9c6ab2');
