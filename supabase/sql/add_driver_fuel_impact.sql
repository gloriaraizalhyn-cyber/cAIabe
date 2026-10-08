-- Run in your cloud SQL Editor, AFTER add_carbon_impact.sql,
-- add_vehicle_type.sql and add_fuel_factors.sql. Safe to re-run.
--
-- Driver-side fuel / CO2 tracking:
--   1. drivers.vehicle_km_per_liter  - the driver's own mileage (optional;
--      null = use the fuel.ts default for their vehicle type).
--   2. carbon_impact_events gets engine-off columns, filled when the driver
--      taps the big "ENGINE OFF" button on the roadside-idle prompt
--      (driver-idle-response). Minutes AFTER that tap count as fuel SAVED,
--      minutes before it count as fuel WASTED.
--   3. get_driver_impact_summary() - the signed-in driver's own totals for
--      today and this week (Philippine time), for the dashboard card.
--
-- Every figure is an ESTIMATE from the same model as _shared/fuel.ts.
-- Price, idle burn and mileage come from approved fuel_factors rows
-- (add_fuel_factors.sql); the fallbacks below MUST stay in sync with
-- fuel.ts's defaults:
--   jeepney : diesel   P85/L, idle 1.2-1.8 L/h, 2.68 kg CO2/L, 4 km/L
--   tricycle: gasoline P65/L, idle 0.6 L/h,     2.31 kg CO2/L, 30 km/L

alter table drivers
  add column if not exists vehicle_km_per_liter numeric
  check (vehicle_km_per_liter is null or (vehicle_km_per_liter >= 1 and vehicle_km_per_liter <= 60));

alter table carbon_impact_events
  add column if not exists engine_off_after_minutes numeric,
  add column if not exists saved_liters numeric not null default 0,
  add column if not exists saved_co2_kg numeric not null default 0;

create or replace function get_driver_impact_summary()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      d.id,
      d.vehicle_type,
      d.vehicle_km_per_liter,
      -- Midpoint of the sourced idle range, L/h -> L/min.
      case d.vehicle_type
        when 'tricycle' then (fuel_factor('tricycle', 'idle_liters_per_hour', 0.6, 'min')
                              + fuel_factor('tricycle', 'idle_liters_per_hour', 0.6, 'max')) / 2 / 60
        else (fuel_factor('jeepney', 'idle_liters_per_hour', 1.2, 'min')
              + fuel_factor('jeepney', 'idle_liters_per_hour', 1.8, 'max')) / 2 / 60
      end as idle_lpm,
      case d.vehicle_type
        when 'tricycle' then fuel_factor('gasoline', 'price_per_liter', 65)
        else fuel_factor('diesel', 'price_per_liter', 85)
      end as price,
      case d.vehicle_type when 'tricycle' then 2.31 else 2.68 end as co2_per_liter,
      case d.vehicle_type
        when 'tricycle' then fuel_factor('tricycle', 'km_per_liter', 30)
        else fuel_factor('jeepney', 'km_per_liter', 4)
      end as default_km_per_liter
    from drivers d
    where d.id = auth.uid()
  ),
  periods as (
    select 'today'::text as key,
           (date_trunc('day', now() at time zone 'Asia/Manila')) at time zone 'Asia/Manila' as since
    union all
    select 'week',
           (date_trunc('week', now() at time zone 'Asia/Manila')) at time zone 'Asia/Manila'
  ),
  stats as (
    select
      p.key,
      p.since,
      me.price,
      me.co2_per_liter,
      me.idle_lpm,
      idle.episodes,
      idle.minutes,
      idle.liters,
      idle.co2_kg,
      idle.saved_liters,
      idle.saved_co2_kg,
      coalesce(q.minutes, 0) as queue_minutes
    from me
    cross join periods p
    cross join lateral (
      select count(*) as episodes,
             coalesce(sum(e.minutes), 0) as minutes,
             coalesce(sum(e.liters), 0) as liters,
             coalesce(sum(e.co2_kg), 0) as co2_kg,
             coalesce(sum(e.saved_liters), 0) as saved_liters,
             coalesce(sum(e.saved_co2_kg), 0) as saved_co2_kg
      from carbon_impact_events e
      where e.kind = 'roadside_idle'
        and e.driver_id = me.id
        and e.episode_started_at >= p.since
    ) idle
    cross join lateral (
      -- Engine-off queue time, same rules as get_carbon_impact_summary():
      -- still-queued entries inside the terminal count up to now(), finished
      -- ones until responded_at, each capped at 120 min.
      select sum(w.m) as minutes
      from (
        select least(
                 extract(epoch from (
                   case
                     when qe.status in ('waiting', 'next_to_go') and qe.geofence_status = 'inside' then now()
                     else qe.responded_at
                   end - qe.arrival_at
                 )) / 60,
                 120
               ) as m
        from queue_entries qe
        where qe.driver_id = me.id and qe.arrival_at >= p.since
      ) w
      where w.m > 0
    ) q
  )
  select json_build_object(
    'vehicle_type', me.vehicle_type,
    'km_per_liter', coalesce(me.vehicle_km_per_liter, me.default_km_per_liter),
    'km_per_liter_is_default', me.vehicle_km_per_liter is null,
    'periods', (
      select json_object_agg(
        s.key,
        json_build_object(
          'since', s.since,
          'idle', json_build_object(
            'episodes', s.episodes,
            'minutes', round(s.minutes, 1),
            'liters', round(s.liters, 2),
            'cost_php', round(s.liters * s.price, 2),
            'co2_kg', round(s.co2_kg, 2)
          ),
          'saved_by_engine_off', json_build_object(
            'liters', round(s.saved_liters, 2),
            'cost_php', round(s.saved_liters * s.price, 2),
            'co2_kg', round(s.saved_co2_kg, 2)
          ),
          'queue_engine_off', json_build_object(
            'minutes', round(s.queue_minutes, 1),
            'liters', round(s.queue_minutes * s.idle_lpm, 2),
            'cost_php', round(s.queue_minutes * s.idle_lpm * s.price, 2),
            'co2_kg', round(s.queue_minutes * s.idle_lpm * s.co2_per_liter, 2)
          ),
          'total_saved_php', round((s.saved_liters + s.queue_minutes * s.idle_lpm) * s.price, 2),
          'total_saved_co2_kg', round(s.saved_co2_kg + s.queue_minutes * s.idle_lpm * s.co2_per_liter, 2)
        )
      )
      from stats s
    )
  )
  from me;
$$;

-- Returns only the calling driver's own totals (auth.uid()), never another
-- driver's, so it is safe to expose to signed-in users.
revoke execute on function get_driver_impact_summary() from public, anon;
grant execute on function get_driver_impact_summary() to authenticated;

-- Check it (as a signed-in driver, e.g. via the app):
-- select get_driver_impact_summary();
