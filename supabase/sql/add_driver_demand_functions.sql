-- Run this in your cloud SQL Editor (after schema.sql, caiabe_seed_routes.sql,
-- and transfer_functions.sql). Adds the RPCs powering the driver-demand-check
-- edge function — Sak.AI's driver-side "WAIT or GO?" / "CONTINUE or GARAGE?"
-- features. Deliberately reuses the existing passenger_waiting_state table
-- and routes.path polyline (see transfer_functions.sql) rather than adding a
-- parallel data model — passengers already scope themselves to a route_id
-- when they call waiting-start, which IS the route-compatibility filter.

-- Currently-active (status='waiting', not expired) passengers on a route,
-- with their distance from a given point — typically the driver's live
-- position. distance_meters is always a straight-line geodesic distance
-- (st_distance on geography). When the route has a stored polyline
-- (routes.path), distance_ahead_meters additionally gives a SIGNED
-- along-route distance from that point (negative = behind it) via
-- st_linelocatepoint projection — the same technique find_boardable_routes /
-- find_route_transfers already use, and the same planar-approximation
-- tradeoff documented in transfer_functions.sql (fine at this city's scale).
-- It's null when the route has no stored path, so callers can fall back to
-- the straight-line distance instead of failing.
create or replace function get_route_active_waiting_passengers(
  p_route_id uuid,
  p_lat double precision,
  p_lng double precision
) returns table(
  id uuid,
  lat double precision,
  lng double precision,
  distance_meters double precision,
  distance_ahead_meters double precision,
  created_at timestamptz
)
language sql
stable
as $$
  with origin as (
    select st_geogfromtext('SRID=4326;POINT(' || p_lng || ' ' || p_lat || ')') as geog
  ),
  route as (
    select r.path, st_length(r.path) as length_meters
    from routes r
    where r.id = p_route_id
  )
  select
    w.id,
    st_y(w.fuzzed_location::geometry) as lat,
    st_x(w.fuzzed_location::geometry) as lng,
    st_distance(w.fuzzed_location, origin.geog) as distance_meters,
    case
      when route.path is not null then
        (
          st_linelocatepoint(route.path::geometry, w.fuzzed_location::geometry)
          - st_linelocatepoint(route.path::geometry, origin.geog::geometry)
        ) * route.length_meters
      else null
    end as distance_ahead_meters,
    w.created_at
  from passenger_waiting_state w
  cross join origin
  cross join route
  where w.route_id = p_route_id
    and w.status = 'waiting'
    and w.expires_at > now()
  order by distance_meters asc;
$$;

-- Raw created_at timestamps for a route's waiting requests since a cutoff,
-- REGARDLESS of current status (waiting/cleared/expired) — this measures how
-- many ride requests actually came in over time, not just the current
-- snapshot, so the driver-demand-check function can bucket real request
-- volume into recent-vs-prior windows for an honest trend signal. No
-- fabricated/pretend history — just real timestamps already on this table.
create or replace function get_route_waiting_activity(
  p_route_id uuid,
  p_since timestamptz
) returns table(created_at timestamptz)
language sql
stable
as $$
  select created_at
  from passenger_waiting_state
  where route_id = p_route_id
    and created_at >= p_since;
$$;

-- A point along a route's stored polyline at a given distance from its
-- start (terminal end). Used by the demo passenger simulator to place
-- riders "N km ahead" using the SAME route geometry driver-demand-check
-- reasons about, instead of a separately-computed straight line.
create or replace function get_route_point_at_distance(
  p_route_id uuid,
  p_distance_meters double precision
) returns table(lat double precision, lng double precision)
language sql
stable
as $$
  select
    st_y(st_lineinterpolatepoint(
      r.path::geometry,
      least(1.0, greatest(0.0, p_distance_meters / nullif(st_length(r.path), 0)))
    )),
    st_x(st_lineinterpolatepoint(
      r.path::geometry,
      least(1.0, greatest(0.0, p_distance_meters / nullif(st_length(r.path), 0)))
    ))
  from routes r
  where r.id = p_route_id
    and r.path is not null;
$$;
