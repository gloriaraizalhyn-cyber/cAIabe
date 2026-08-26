-- Run in your cloud SQL Editor. Distinguishes jeepney vs tricycle drivers so
-- fuel-cost estimation (see _shared/fuel.ts and driver-fuel-check) can pick
-- the right consumption profile. Existing rows default to 'jeepney' since
-- that's all the app supported until now — fare_reference already has its
-- own vehicle_type column (default 'jeepney') for the same reason.
alter table drivers
  add column if not exists vehicle_type text not null default 'jeepney'
  check (vehicle_type in ('jeepney', 'tricycle'));
