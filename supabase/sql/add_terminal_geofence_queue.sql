-- Run in your cloud SQL Editor, after schema.sql and rpc_functions.sql.
-- Adds configurable geofence hysteresis to terminals, and away-state +
-- geofence tracking to queue_entries, so a driver who steps away from the
-- terminal keeps their queue position instead of being removed.

alter table terminals
  add column if not exists geofence_radius_meters double precision not null default 100,
  add column if not exists geofence_exit_radius_meters double precision not null default 130;
alter table queue_entries
  add column if not exists geofence_status text not null default 'outside'
    check (geofence_status in ('inside','outside')),
  add column if not exists last_inside_at timestamptz,
  add column if not exists last_outside_at timestamptz;

-- Widen the status check to add 'temporarily_away'. queue_entries_status_check
-- is Postgres's default auto-generated name for the inline `check` on
-- queue_entries.status in schema.sql — confirm on your instance with:
--   select conname from pg_constraint where conrelid = 'queue_entries'::regclass;
alter table queue_entries drop constraint if exists queue_entries_status_check;
alter table queue_entries add constraint queue_entries_status_check
  check (status in ('waiting','next_to_go','driving','done_for_day','temporarily_away'));

-- Terminal geofence check used by driver-location-update (see
-- rpc_functions.sql for the canonical copy of this function — kept in sync
-- here so this file is a complete, standalone migration).
create or replace function get_terminal_geofence(
  p_terminal_id uuid,
  p_lat double precision,
  p_lng double precision
) returns table(
  distance_meters double precision,
  enter_radius_meters double precision,
  exit_radius_meters double precision
)
language sql
stable
as $$
  select
    st_distance(
      location,
      st_geogfromtext('SRID=4326;POINT(' || p_lng || ' ' || p_lat || ')')
    ),
    geofence_radius_meters,
    geofence_exit_radius_meters
  from terminals
  where id = p_terminal_id;
$$;
