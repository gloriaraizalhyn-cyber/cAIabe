-- Same as export_geojson.sql, but filtered to ONE route by name.
-- Just change 'Florida' to whichever route you want to inspect.

select json_build_object(
  'type', 'FeatureCollection',
  'features', json_agg(feature)
) as geojson
from (
  select json_build_object(
    'type', 'Feature',
    'geometry', st_asgeojson(terminus)::json,
    'properties', json_build_object(
      'name', name,
      'color', coalesce(color, 'blue'),
      'kind', 'route_terminus'
    )
  ) as feature
  from routes
  where name = 'Florida'   -- ← change this to the route you want

  union all

  -- also pulls in every terminal, since a route's queue lives at one or
  -- more terminals — remove this whole "union all" block if you only want
  -- the single terminus point and nothing else
  select json_build_object(
    'type', 'Feature',
    'geometry', st_asgeojson(t.location)::json,
    'properties', json_build_object(
      'name', t.name,
      'kind', 'terminal'
    )
  ) as feature
  from terminals t
  join terminal_routes tr on tr.terminal_id = t.id
  join routes r on r.id = tr.route_id
  where r.name = 'Florida'  -- ← same route name here too
) sub;
