-- Run in your cloud SQL Editor, after schema.sql.
--
-- Passenger-facing bug fix: parked/queued drivers were leaking onto the
-- passenger map and into the ETA/WAIT-GO recommendation, because both
-- useLiveDriverPositions' initial fetch and nearby-jeepney-eta's
-- get_route_driver_positions (lookup_functions.sql) read driver_live_state
-- directly with no queue-status filter. Per the product spec, a passenger
-- should only ever see "next_to_go" or "driving" jeepneys — never "waiting"
-- (parked at the terminal) or "temporarily_away" ones.
--
-- This function is the single source of truth for that visibility rule —
-- both driver-location-update's realtime broadcast gate and this RPC's
-- initial-fetch/ETA use must agree on "next_to_go/driving = visible", so it
-- lives here once rather than being duplicated as a literal in application
-- code. get_route_driver_positions is left in place (harmless) but nothing
-- passenger-facing should call it anymore — use this instead.
create or replace function get_route_visible_drivers(p_route_id uuid)
returns table(driver_id uuid, lat double precision, lng double precision, capacity_state text)
language sql
stable
as $$
  select dls.driver_id, st_y(dls.position::geometry), st_x(dls.position::geometry), dls.capacity_state
  from driver_live_state dls
  join queue_entries qe
    on qe.driver_id = dls.driver_id
    and qe.status in ('next_to_go', 'driving')
  where dls.route_id = p_route_id
    and dls.position is not null;
$$;
