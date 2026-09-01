-- Run in your cloud SQL Editor. Two hot query paths had no supporting index:
--
--  - driver_live_state is filtered by route_id on every passenger map
--    refresh and every nearby-jeepney-eta call (get_route_visible_drivers /
--    get_route_driver_positions), but only carried a primary key on
--    driver_id.
--  - passenger_waiting_state is filtered by (route_id, status, expires_at)
--    on every driver-demand-check call and waiting-start/-clear broadcast
--    lookup, with no index at all.
create index if not exists idx_driver_live_state_route
  on driver_live_state (route_id);

create index if not exists idx_passenger_waiting_route_status_expires
  on passenger_waiting_state (route_id, status, expires_at);
