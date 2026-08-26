-- Run this AFTER schema.sql and caiabe_seed_routes.sql (the latter is what
-- adds routes.path). Used by the route-search edge function to check
-- whether a route's actual path — not just its terminus — passes near both
-- the passenger's origin and destination.

-- Returns one row if `p_route_id`'s path comes within `p_max_walk_meters` of
-- BOTH the origin and the destination, giving:
--   * walk distance from each point to the path
--   * the ride distance along the path between where each point projects
--     onto it
--   * the board/alight coordinates (closest point on the path to each of
--     origin/destination) so the caller can look up a real driving
--     duration for just that ride segment
-- Returns zero rows if the route doesn't serve this trip at all.
--
-- Note: this doesn't enforce travel direction (i.e. it doesn't check that
-- origin comes "before" destination along the stored path direction) —
-- jeepney routes here are typically loops or the path direction isn't
-- guaranteed consistent in the source data, so this deliberately matches on
-- proximity + ride distance only, not directionality.
create or replace function match_route_for_trip(
  p_route_id uuid,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_destination_lat double precision,
  p_destination_lng double precision,
  p_max_walk_meters double precision default 400
) returns table(
  origin_walk_meters double precision,
  destination_walk_meters double precision,
  ride_distance_meters double precision,
  board_lat double precision,
  board_lng double precision,
  alight_lat double precision,
  alight_lng double precision
)
language sql
stable
as $$
  with route_path as (
    select
      path,
      path::geometry as path_geom,
      st_length(path) as path_length_meters
    from routes
    where id = p_route_id
      and path is not null
  ),
  pts as (
    select
      st_geogfromtext('SRID=4326;POINT(' || p_origin_lng || ' ' || p_origin_lat || ')') as origin_pt,
      st_geogfromtext('SRID=4326;POINT(' || p_destination_lng || ' ' || p_destination_lat || ')') as destination_pt
  ),
  fractions as (
    select
      st_linelocatepoint(route_path.path_geom, pts.origin_pt::geometry) as origin_fraction,
      st_linelocatepoint(route_path.path_geom, pts.destination_pt::geometry) as destination_fraction
    from route_path, pts
  )
  select
    st_distance(route_path.path, pts.origin_pt) as origin_walk_meters,
    st_distance(route_path.path, pts.destination_pt) as destination_walk_meters,
    abs(fractions.destination_fraction - fractions.origin_fraction)
      * route_path.path_length_meters as ride_distance_meters,
    st_y(st_lineinterpolatepoint(route_path.path_geom, fractions.origin_fraction)) as board_lat,
    st_x(st_lineinterpolatepoint(route_path.path_geom, fractions.origin_fraction)) as board_lng,
    st_y(st_lineinterpolatepoint(route_path.path_geom, fractions.destination_fraction)) as alight_lat,
    st_x(st_lineinterpolatepoint(route_path.path_geom, fractions.destination_fraction)) as alight_lng
  from route_path, pts, fractions
  where st_dwithin(route_path.path, pts.origin_pt, p_max_walk_meters)
    and st_dwithin(route_path.path, pts.destination_pt, p_max_walk_meters)
    -- guards against a degenerate near-zero-length ride when origin and
    -- destination project to (almost) the same point on the path
    and abs(fractions.destination_fraction - fractions.origin_fraction)
      * route_path.path_length_meters > 50;
$$;
