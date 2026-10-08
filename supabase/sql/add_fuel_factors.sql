-- Run in your cloud SQL Editor, AFTER schema.sql. Safe to re-run.
-- Then re-run add_carbon_impact.sql and add_driver_fuel_impact.sql so their
-- functions read the values from here.
--
-- Sourced fuel figures. Rows are extracted from studies, DOE price reports,
-- or the team's own measurements by fuel-factors.js (Gemini reads the PDF
-- and must quote the sentence each number came from). Every row lands as
-- 'pending'; only rows a person has checked against the source and
-- approved are used by the app.
--
-- Consumers:
--   - supabase/functions/_shared/fuel.ts (loadFuelFactors)
--   - get_carbon_impact_summary()   (add_carbon_impact.sql)
--   - get_driver_impact_summary()   (add_driver_fuel_impact.sql)
-- Each falls back to its own built-in default when a factor has no approved
-- row, so an empty table changes nothing.
--
-- CO2 per liter is deliberately NOT a factor here: it's combustion
-- chemistry (IPCC 2006 defaults), not something that varies by study.

create table if not exists fuel_factors (
  id uuid primary key default gen_random_uuid(),
  subject text not null,                 -- jeepney | tricycle | car | diesel | gasoline
  factor text not null,                  -- see the check constraint below
  value numeric not null,                -- always in the factor's canonical unit
  unit text not null,
  stated_value text,                     -- the number exactly as the source printed it
  stated_unit text,                      -- the source's own unit, if it differs
  source_title text not null,
  source_url text,                       -- URL, or the local file name it was read from
  source_page text,
  source_quote text not null,            -- the sentence/table row the number came from
  data_date date,                        -- when the figure applies (prices: the report week)
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text,
  extracted_by text,                     -- model name, or 'manual'
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint fuel_factors_known_key check ((subject || '.' || factor) in (
    'jeepney.km_per_liter',            -- km/L
    'tricycle.km_per_liter',           -- km/L
    'car.km_per_liter',                -- km/L, the "drive alone" comparison car
    'jeepney.idle_liters_per_hour',    -- L/h, engine on, vehicle stopped
    'tricycle.idle_liters_per_hour',   -- L/h
    'jeepney.avg_riders',              -- passengers on board, on average
    'diesel.price_per_liter',          -- PHP/L
    'gasoline.price_per_liter'         -- PHP/L
  ))
);

create index if not exists idx_fuel_factors_key_status
  on fuel_factors (subject, factor, status);

alter table fuel_factors enable row level security;

-- No public policies: written and reviewed only through fuel-factors.js
-- (service role). The app reads the approved aggregate below.
grant select, insert, update, delete on fuel_factors to service_role;

-- One row per factor that has approved sources:
--   value      median of the approved values (studies disagree; the median
--              keeps one outlier from moving the figure)
--   min/max    the spread across sources (fuel.ts uses it for the idle range)
-- Prices only count rows from the newest data_date, so approving this
-- week's DOE report replaces last week's instead of averaging with it.
create or replace function fuel_factor_summary()
returns table (
  subject text,
  factor text,
  value numeric,
  min_value numeric,
  max_value numeric,
  source_count int
)
language sql
stable
security definer
set search_path = public
as $$
  with approved as (
    select f.subject, f.factor, f.value, f.data_date,
           max(f.data_date) over (partition by f.subject, f.factor) as newest_date
    from fuel_factors f
    where f.status = 'approved'
  ),
  current_rows as (
    select a.*
    from approved a
    where a.factor <> 'price_per_liter' or a.data_date is not distinct from a.newest_date
  )
  select c.subject,
         c.factor,
         (percentile_cont(0.5) within group (order by c.value))::numeric,
         min(c.value),
         max(c.value),
         count(*)::int
  from current_rows c
  group by c.subject, c.factor;
$$;

-- Approved figures only; safe to expose (the app could show its sources).
grant execute on function fuel_factor_summary() to anon, authenticated, service_role;

-- Single figure for SQL callers. p_pick: 'value' (median), 'min' or 'max'.
create or replace function fuel_factor(
  p_subject text,
  p_factor text,
  p_fallback numeric,
  p_pick text default 'value'
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case p_pick when 'min' then s.min_value when 'max' then s.max_value else s.value end
      from fuel_factor_summary() s
      where s.subject = p_subject and s.factor = p_factor
    ),
    p_fallback
  );
$$;

grant execute on function fuel_factor(text, text, numeric, text) to anon, authenticated, service_role;

-- Check it:
-- select * from fuel_factor_summary();
-- select fuel_factor('jeepney', 'km_per_liter', 4);
