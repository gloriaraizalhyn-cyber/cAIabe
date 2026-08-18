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
