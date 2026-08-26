-- Run this in SQL Editor (cloud project) after schema.sql and rpc_functions.sql.
-- Lets client code (like the simulator script) fetch readable lat/lng instead
-- of raw PostGIS geography values, and look terminals up by name.

create or replace function get_terminal_coords(p_name text)
returns table(id uuid, lat double precision, lng double precision)
language sql
stable
as $$
  select id, st_y(location::geometry), st_x(location::geometry)
  from terminals
  where name = p_name
  limit 1;
$$;

create or replace function get_route_terminus_coords(p_route_id uuid)
returns table(lat double precision, lng double precision)
language sql
stable
as $$
  select st_y(terminus::geometry), st_x(terminus::geometry)
  from routes
  where id = p_route_id
  limit 1;
$$;

-- Used by nearby-jeepney-eta to feed live driver positions into Google's
-- Routes API as origins.
create or replace function get_route_driver_positions(p_route_id uuid)
returns table(driver_id uuid, lat double precision, lng double precision, capacity_state text)
language sql
stable
as $$
  select driver_id, st_y(position::geometry), st_x(position::geometry), capacity_state
  from driver_live_state
  where route_id = p_route_id
    and position is not null;
$$;

-- Used by driver-fuel-check to read the calling driver's own current
-- position — a single-row equivalent of get_route_driver_positions that
-- doesn't require the driver to have a route_id (tricycle drivers may not).
create or replace function get_driver_position(p_driver_id uuid)
returns table(lat double precision, lng double precision)
language sql
stable
as $$
  select st_y(position::geometry), st_x(position::geometry)
  from driver_live_state
  where driver_id = p_driver_id
    and position is not null;
$$;
