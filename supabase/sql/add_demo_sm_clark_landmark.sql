-- Run this AFTER add_landmarks.sql, in the cloud SQL Editor.
--
-- Two landmark corrections needed for the SM City Clark -> SM City
-- Telabastagan demo journey. Both must be mirrored by hand into
-- frontend/src/shared/constants/tripSearchFixtures.js (PLACE_SUGGESTIONS_FIXTURE) —
-- see the header of add_landmarks.sql for why those two lists are
-- deliberately duplicated rather than shared.
--
-- 1) SM City Clark was missing entirely, so neither the autocomplete nor the
--    SMS trip planner could resolve it. It sits at M.A. Roxas Highway,
--    Barangay Malabanias, Angeles City (15.16845, 120.58018) — by the Clark
--    Main Gate, NOT deep inside the freeport. That puts it ~178 m from the
--    "Checkpoint - Holy Angel University - Balibago" polyline, comfortably
--    inside route-search's WALK_BOARD_METERS = 700, and inside
--    SERVICE_AREA_BOUNDS (north 15.1847), so no bounds change is needed.
--
-- 2) SM City Telabastagan was pinned at 15.1227, 120.5996 — which is the
--    Petron Angeles City terminal's own coordinate, ~365 m from the real
--    mall. Routing worked either way, but origin/destination pins should be
--    truthful on a projected map. Real coordinate per the mall's published
--    location on MacArthur Hwy, Brgy Telabastagan, City of San Fernando.

insert into landmarks (label, subtitle, category, lat, lng)
select 'SM City Clark', 'M.A. Roxas Hwy, Malabanias, Angeles City', 'landmark', 15.16845, 120.58018
where not exists (select 1 from landmarks where label = 'SM City Clark');

update landmarks
   set lat = 15.120246,
       lng = 120.6018769
 where label = 'SM City Telabastagan';

-- Verify: both should come back, and findLandmark() in
-- supabase/functions/_shared/landmarks.ts should resolve each to exactly one
-- row (it throws AmbiguousLandmarkError on more than one substring match).
select label, category, lat, lng
  from landmarks
 where label in ('SM City Clark', 'SM City Telabastagan')
 order by label;
