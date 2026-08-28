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
