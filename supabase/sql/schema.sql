-- Jeepney Routing System — Database Schema
-- Run via: supabase db reset (local) or paste into Supabase SQL Editor (cloud)

create extension if not exists postgis;
create extension if not exists pg_cron;

-- ==========================================================
-- ROUTES & TERMINALS
-- ==========================================================

create table routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,                                  -- null => defaults to blue in app logic
  terminus geography(point, 4326) not null,    -- used for end-of-route auto-detection
  path geography(linestring, 4326),            -- real route polyline; route-search/transfer_functions/
                                                -- driver-demand-check all read this — was previously only
                                                -- added by caiabe_seed_routes.sql, so a plain `supabase db
                                                -- reset` from this file alone would silently break them
  created_at timestamptz not null default now()
);

create table terminals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location geography(point, 4326) not null,
  geofence_radius_meters double precision not null default 100,       -- enter threshold
  geofence_exit_radius_meters double precision not null default 130,  -- exit threshold (hysteresis vs GPS jitter)
  created_at timestamptz not null default now()
);

-- a terminal can dispatch multiple routes; queue is tracked per (terminal, route)
create table terminal_routes (
  terminal_id uuid references terminals(id) on delete cascade,
  route_id uuid references routes(id) on delete cascade,
  primary key (terminal_id, route_id)
);

create table fare_reference (
  route_id uuid references routes(id) on delete cascade,
  vehicle_type text not null default 'jeepney',
  base_fare numeric not null,
  per_km_rate numeric not null,
  primary key (route_id, vehicle_type)
);

-- ==========================================================
-- DRIVERS
-- ==========================================================

create table drivers (
  id uuid primary key references auth.users(id) on delete cascade,
  route_id uuid references routes(id),
  jeep_color text,
  home_terminal_id uuid references terminals(id),
  license_number text,
  license_photo_url text,
  franchise_permit_number text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

-- ==========================================================
-- QUEUE
-- ==========================================================

create table queue_entries (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references drivers(id) on delete cascade,
  route_id uuid references routes(id),
  terminal_id uuid references terminals(id),
  status text not null default 'waiting'
    check (status in ('waiting','next_to_go','driving','done_for_day','temporarily_away')),
  arrival_at timestamptz not null default now(),  -- drives queue ordering
  notified_at timestamptz,                        -- set when next-N notification fires
  responded_at timestamptz,
  geofence_status text not null default 'outside'  -- physical presence at the terminal, tracked
    check (geofence_status in ('inside','outside')), -- independently of queue lifecycle (status)
  last_inside_at timestamptz,
  last_outside_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_queue_route_status_arrival
  on queue_entries (route_id, status, arrival_at);

-- ==========================================================
-- LIVE STATE (driver GPS + capacity)
-- ==========================================================

create table driver_live_state (
  driver_id uuid primary key references drivers(id) on delete cascade,
  route_id uuid references routes(id),
  position geography(point, 4326),
  capacity_state text not null default 'available'
    check (capacity_state in ('available','full')),
  last_updated timestamptz not null default now()
);

-- ==========================================================
-- PASSENGER WAITING STATE
-- ==========================================================

create table passenger_waiting_state (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references routes(id),
  fuzzed_location geography(point, 4326) not null,
  status text not null default 'waiting'
    check (status in ('waiting','cleared')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

-- ==========================================================
-- BOOKMARKS (P1 / secondary)
-- ==========================================================

create table bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,  -- null if guest/local-storage-only path is used app-side
  origin geography(point, 4326) not null,
  destination geography(point, 4326) not null,
  route_id uuid references routes(id),
  created_at timestamptz not null default now()
);

-- ==========================================================
-- ROW LEVEL SECURITY
-- ==========================================================

alter table routes enable row level security;
alter table terminals enable row level security;
alter table terminal_routes enable row level security;
alter table fare_reference enable row level security;
alter table drivers enable row level security;
alter table queue_entries enable row level security;
alter table driver_live_state enable row level security;
alter table passenger_waiting_state enable row level security;
alter table bookmarks enable row level security;

-- Reference/lookup data: public read, no public write
create policy "public read routes" on routes for select using (true);
create policy "public read terminals" on terminals for select using (true);
create policy "public read terminal_routes" on terminal_routes for select using (true);
create policy "public read fare_reference" on fare_reference for select using (true);

-- Drivers: a driver can read/update only their own row
create policy "driver reads own row" on drivers
  for select using (auth.uid() = id);
create policy "driver updates own row" on drivers
  for update using (auth.uid() = id);
create policy "driver inserts own row" on drivers
  for insert with check (auth.uid() = id);

-- Queue entries: drivers can see entries for their own route only (matches
-- the "drivers only ever see passengers/queue within their own route" rule)
create policy "driver reads own-route queue" on queue_entries
  for select using (
    route_id in (select route_id from drivers where id = auth.uid())
  );
create policy "driver inserts own queue entry" on queue_entries
  for insert with check (driver_id = auth.uid());
create policy "driver updates own queue entry" on queue_entries
  for update using (driver_id = auth.uid());

-- Driver live state: readable by anyone scoped to a route (passengers need
-- this to see incoming jeepneys); writable only by the driver themself
create policy "public reads live state" on driver_live_state
  for select using (true);
create policy "driver writes own live state" on driver_live_state
  for insert with check (driver_id = auth.uid());
create policy "driver updates own live state" on driver_live_state
  for update using (driver_id = auth.uid());

-- Passenger waiting state: no auth on the passenger side, so this table is
-- intentionally handled via the service role inside Edge Functions rather
-- than exposed directly to anon clients. No public policies are added here
-- on purpose — all reads/writes should go through waiting-start/waiting-clear.

-- Bookmarks: user can only see their own
create policy "user reads own bookmarks" on bookmarks
  for select using (auth.uid() = user_id);
create policy "user writes own bookmarks" on bookmarks
  for insert with check (auth.uid() = user_id);
create policy "user deletes own bookmarks" on bookmarks
  for delete using (auth.uid() = user_id);

-- ==========================================================
-- CLEANUP JOB (expired passenger waiting rows)
-- ==========================================================

select cron.schedule(
  'clear-expired-waiting-state',
  '*/15 * * * *',
  $$ delete from passenger_waiting_state where expires_at < now(); $$
);

-- ==========================================================
-- SEED DATA (for local Postman testing)
-- ==========================================================

insert into terminals (name, location) values
  ('Terminal A', st_geogfromtext('SRID=4326;POINT(120.9647 15.0794)'));

insert into routes (name, color, terminus) values
  ('Florida', 'green', st_geogfromtext('SRID=4326;POINT(120.9317 15.1449)')),
  ('Porac', 'yellow', st_geogfromtext('SRID=4326;POINT(120.5578 15.0645)')),
  ('San Fernando', null, st_geogfromtext('SRID=4326;POINT(120.6890 15.0350)'));

insert into fare_reference (route_id, base_fare, per_km_rate)
  select id, 13.00, 2.00 from routes;
