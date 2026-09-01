-- Run this AFTER schema.sql. Adds one RPC function used by the
-- driver-location-update edge function.

create or replace function is_near_terminus(
  p_route_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_radius_meters double precision default 100
) returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from routes
    where id = p_route_id
      and st_dwithin(
        terminus,
        st_geogfromtext('SRID=4326;POINT(' || p_lng || ' ' || p_lat || ')'),
        p_radius_meters
      )
  );
$$;

-- Optional: if you want fcm_token stored directly on drivers (referenced by
-- queue-advance/index.ts) rather than a separate devices table:
alter table drivers add column if not exists fcm_token text;

-- Terminal geofence check used by driver-location-update to track whether a
-- queued driver is physically at their terminal. Returns the raw distance
-- plus both configurable radii in one round trip; hysteresis (which radius
-- to compare against) is applied by the caller based on the entry's current
-- geofence_status, since that's stateful and doesn't belong in a stable SQL
-- function.
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
