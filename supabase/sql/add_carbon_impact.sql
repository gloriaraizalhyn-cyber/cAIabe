-- Run in your cloud SQL Editor, AFTER schema.sql,
-- add_terminal_geofence_queue.sql and add_fuel_factors.sql. Safe to re-run.
--
-- Backs the Carbon Impact panel (CarbonImpactPanel.jsx — admin dashboard
-- and the demo stage). Every figure here is an ESTIMATE derived from the
-- same fuel model the rest of the app uses (supabase/functions/_shared/
-- fuel.ts); the panel labels it that way.
--
-- Two kinds of events are logged by edge functions (service role):
--   - roadside_idle: driver-demand-check, one row per idling episode the
--     driver was warned about, kept current as the episode grows. This is
--     idle burn the app CAUGHT (fuel already wasted, flagged to the driver),
--     not burn avoided.
--   - rider_trip: waiting-start, one row per passenger who commits to a
--     jeepney trip. co2_kg is the CO2 saved versus driving that same ride
--     distance alone (estimateTripCarbon). No passenger location is stored.
--
-- The third figure, engine-off queueing, needs no log: it's computed live
-- from queue_entries below.

create table if not exists carbon_impact_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('roadside_idle', 'rider_trip')),
  driver_id uuid references drivers(id) on delete set null,
  route_id uuid references routes(id) on delete set null,
  episode_started_at timestamptz,          -- roadside_idle only
  minutes numeric,                         -- roadside_idle only
  distance_km numeric,                     -- rider_trip only
  liters numeric,                          -- roadside_idle only
  co2_kg numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_carbon_impact_kind_created
  on carbon_impact_events (kind, created_at desc);
create index if not exists idx_carbon_impact_driver_episode
  on carbon_impact_events (driver_id, episode_started_at desc)
  where kind = 'roadside_idle';

alter table carbon_impact_events enable row level security;

-- No public policies: rows are written only by edge functions (service
-- role), and read only as aggregates through the function below, so no
-- per-driver or per-route detail is ever exposed to the browser.
-- Explicit grant because new Supabase projects no longer auto-grant new
-- tables to the API roles.
grant select, insert, update on carbon_impact_events to service_role;

-- Totals since p_since (default: start of today, Philippine time).
--
-- queue_idle_liters_per_min is the midpoint of the approved jeepney idle
-- range in fuel_factors (add_fuel_factors.sql). Its fallbacks (1.2-1.8 L/h)
-- and DIESEL_CO2_KG_PER_LITER (2.68) MUST stay in sync with fuel.ts — SQL
-- can't import the Deno module.
--
-- Queue minutes: drivers still queued and physically inside the terminal
-- count up to now(); finished entries count until responded_at. Entries
-- that finished without a response timestamp are skipped (no reliable end
-- time — queue_entries.updated_at isn't maintained). Each entry is capped
-- at 120 min so one forgotten entry can't dominate the total.
create or replace function get_carbon_impact_summary(p_since timestamptz default null)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      coalesce(
        p_since,
        (date_trunc('day', now() at time zone 'Asia/Manila')) at time zone 'Asia/Manila'
      ) as since,
      (fuel_factor('jeepney', 'idle_liters_per_hour', 1.2, 'min')
        + fuel_factor('jeepney', 'idle_liters_per_hour', 1.8, 'max')) / 2 / 60 as queue_idle_liters_per_min,
      2.68::numeric as diesel_co2_kg_per_liter
  ),
  riders as (
    select count(*) as trips,
           coalesce(sum(distance_km), 0) as distance_km,
           coalesce(sum(co2_kg), 0) as co2_saved_kg
    from carbon_impact_events, params
    where kind = 'rider_trip' and created_at >= params.since
  ),
  idle as (
    select count(*) as episodes,
           coalesce(sum(minutes), 0) as minutes,
           coalesce(sum(liters), 0) as liters,
           coalesce(sum(co2_kg), 0) as co2_kg
    from carbon_impact_events, params
    where kind = 'roadside_idle' and episode_started_at >= params.since
  ),
  queue_waits as (
    select least(
             extract(epoch from (
               case
                 when qe.status in ('waiting', 'next_to_go') and qe.geofence_status = 'inside' then now()
                 else qe.responded_at
               end - qe.arrival_at
             )) / 60,
             120
           ) as minutes
    from queue_entries qe, params
    where qe.arrival_at >= params.since
  ),
  queue as (
    select count(*) filter (where minutes > 0) as entries,
           coalesce(sum(minutes) filter (where minutes > 0), 0) as minutes
    from queue_waits
  )
  select json_build_object(
    'since', params.since,
    'rider_trips', json_build_object(
      'count', riders.trips,
      'distance_km', round(riders.distance_km, 1),
      'co2_saved_kg', round(riders.co2_saved_kg, 2)
    ),
    'roadside_idle', json_build_object(
      'episodes', idle.episodes,
      'minutes', round(idle.minutes, 1),
      'liters', round(idle.liters, 2),
      'co2_kg', round(idle.co2_kg, 2)
    ),
    'queue_engine_off', json_build_object(
      'entries', queue.entries,
      'minutes', round(queue.minutes, 1),
      'liters', round(queue.minutes * params.queue_idle_liters_per_min, 2),
      'co2_kg', round(queue.minutes * params.queue_idle_liters_per_min * params.diesel_co2_kg_per_liter, 2)
    ),
    'total_co2_avoided_kg', round(
      riders.co2_saved_kg
        + queue.minutes * params.queue_idle_liters_per_min * params.diesel_co2_kg_per_liter,
      2
    )
  )
  from params, riders, idle, queue;
$$;

-- Aggregates only — safe for the anonymous demo stage to call.
grant execute on function get_carbon_impact_summary(timestamptz) to anon, authenticated;

-- Check it:
-- select get_carbon_impact_summary();
-- select get_carbon_impact_summary(now() - interval '7 days');
