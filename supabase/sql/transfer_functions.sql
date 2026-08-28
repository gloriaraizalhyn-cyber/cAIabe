-- Run this AFTER schema.sql, caiabe_seed_routes.sql, and lookup_functions.sql.
-- Powers route-search's multi-leg planning: snapping a point to nearby route
-- polylines, finding where two routes pass close enough to transfer between,
-- and extracting the real polyline shape of a ride leg for the map.
--
-- NOTE: fraction (from st_linelocatepoint) is computed on unprojected
-- lon/lat geometry, so "fraction * route_length_meters" (route_length_meters
-- comes from st_length on the geography column, i.e. real geodesic meters)
-- is a planar approximation of arc-length-from-the-start for the sub-span
-- between two fractions. At Angeles City's scale (a few km) this is well
-- within the margin of error already introduced by the fixed average-speed
-- travel-time heuristic in route-search, so no reprojection is done here.

-- 1) Routes within walking distance of a point (used for both the
-- passenger's origin and destination).
create or replace function find_boardable_routes(
  p_lat double precision,
  p_lng double precision,
  p_max_walk_meters double precision default 700
) returns table(
  route_id uuid,
  distance_meters double precision,
  lat double precision,
  lng double precision,
  fraction double precision,
  route_length_meters double precision
)
language sql
stable
as $$
  select
    r.id,
    st_distance(r.path, pt.geog),
    st_y(st_closestpoint(r.path::geometry, pt.geog::geometry)),
    st_x(st_closestpoint(r.path::geometry, pt.geog::geometry)),
    st_linelocatepoint(r.path::geometry, pt.geog::geometry),
    st_length(r.path)
  from routes r
  cross join lateral (
    select st_geogfromtext(
      'SRID=4326;POINT(' || p_lng || ' ' || p_lat || ')'
    ) as geog
  ) pt
  where r.path is not null
    and st_dwithin(r.path, pt.geog, p_max_walk_meters);
$$;

-- 2) Every pair of distinct routes whose polylines pass within transfer
-- distance of each other, with the closest-point pair between them.
create or replace function find_route_transfers(
  p_max_transfer_meters double precision default 250
) returns table(
  route_a uuid,
  route_b uuid,
  a_lat double precision,
  a_lng double precision,
  a_fraction double precision,
  a_length_meters double precision,
  b_lat double precision,
  b_lng double precision,
  b_fraction double precision,
  b_length_meters double precision,
  distance_meters double precision
)
language sql
stable
as $$
  select
    a.id,
    b.id,
    st_y(st_closestpoint(a.path::geometry, b.path::geometry)),
    st_x(st_closestpoint(a.path::geometry, b.path::geometry)),
    st_linelocatepoint(a.path::geometry, st_closestpoint(a.path::geometry, b.path::geometry)),
    st_length(a.path),
    st_y(st_closestpoint(b.path::geometry, a.path::geometry)),
    st_x(st_closestpoint(b.path::geometry, a.path::geometry)),
    st_linelocatepoint(b.path::geometry, st_closestpoint(b.path::geometry, a.path::geometry)),
    st_length(b.path),
    st_distance(a.path, b.path)
  from routes a
  join routes b on a.id < b.id
  where a.path is not null
    and b.path is not null
    and st_dwithin(a.path, b.path, p_max_transfer_meters);
$$;

-- 3) The actual polyline points of a route between two boarding/alighting
-- fractions (order-independent), for drawing the real ride-leg shape on the
-- map instead of a straight line. Returned as a JSON array of {lat,lng} so
-- a single RPC call hands back something the edge function can parse
-- directly (PostgREST can't return a raw geometry/point[] usably otherwise).
create or replace function get_route_subpath_points(
  p_route_id uuid,
  p_fraction_a double precision,
  p_fraction_b double precision
) returns json
language sql
stable
as $$
  select coalesce(
    (
      select json_agg(
        json_build_object('lat', st_y(dp.geom), 'lng', st_x(dp.geom))
        order by dp.path[1]
      )
      from routes r
      cross join lateral st_dumppoints(
        st_linesubstring(
          r.path::geometry,
          least(p_fraction_a, p_fraction_b),
          greatest(p_fraction_a, p_fraction_b)
        )
      ) as dp(path, geom)
      where r.id = p_route_id
    ),
    '[]'::json
  );
$$;
