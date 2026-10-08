-- Run in your cloud SQL Editor, after add_route_visible_drivers_rpc.sql.
--
-- Bug: get_route_visible_drivers returned ZERO rows for passengers.
--
-- The function joins queue_entries to filter drivers down to
-- next_to_go/driving. It was created as a plain `language sql stable`
-- function, so it runs with the CALLER's privileges and RLS applies to that
-- join. queue_entries' select policy is:
--
--     route_id in (select route_id from drivers where id = auth.uid())
--
-- Passengers are fully anonymous — auth.uid() is null — so that subquery is
-- empty, the join matches nothing, and the function returns []. Verified
-- against the live project: the same call returns the driving unit under the
-- service role and [] under the anon key.
--
-- Effect: useLiveDriverPositions' INITIAL fetch was always empty for
-- passengers. Jeepneys only appeared once the next position_updated
-- broadcast landed, so the map opened blank, and a next_to_go driver (parked,
-- broadcasting rarely) could stay invisible indefinitely. nearby-jeepney-eta
-- was unaffected because it calls this with a service-role client.
--
-- Fix: security definer. That is what this function was always meant to be —
-- its own header calls it "the single source of truth" for the visibility
-- rule, which only works if it can evaluate that rule itself instead of
-- being pre-filtered by the caller's RLS.
--
-- This exposes strictly LESS than what is already public: driver_live_state
-- carries `for select using (true)` (schema.sql), so any anon caller can
-- already read every driver's position directly. This function narrows that
-- to next_to_go/driving on one route, which is the documented product rule.
create or replace function get_route_visible_drivers(p_route_id uuid)
returns table(driver_id uuid, lat double precision, lng double precision, capacity_state text)
language sql
stable
security definer
set search_path = public
as $$
  select dls.driver_id, st_y(dls.position::geometry), st_x(dls.position::geometry), dls.capacity_state
  from driver_live_state dls
  join queue_entries qe
    on qe.driver_id = dls.driver_id
    and qe.status in ('next_to_go', 'driving')
  where dls.route_id = p_route_id
    and dls.position is not null;
$$;

grant execute on function get_route_visible_drivers(uuid) to anon, authenticated;

-- Verify as a passenger would: this must now return the same rows the
-- service role sees. Replace the id with any route that has a driving unit.
-- select * from get_route_visible_drivers('e5f1a7fe-d258-44ca-a823-0360df2d1221');
