-- Run this in your cloud SQL Editor to get all your routes and terminals
-- as a single GeoJSON FeatureCollection you can paste/drop into geojson.io.

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

  union all

  select json_build_object(
    'type', 'Feature',
    'geometry', st_asgeojson(location)::json,
    'properties', json_build_object(
      'name', name,
      'kind', 'terminal'
    )
  ) as feature
  from terminals
) sub;
