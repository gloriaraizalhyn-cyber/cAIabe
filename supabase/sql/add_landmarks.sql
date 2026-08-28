-- Run this AFTER schema.sql. Server-side counterpart to the frontend's
-- PLACE_SUGGESTIONS_FIXTURE (frontend/src/shared/constants/tripSearchFixtures.js)
-- so the SMS trip-planner (sms-webhook) can resolve texted place names like
-- "JENRA Grand Mall" to coordinates. Keep in sync with that fixture by hand
-- if it changes — no code-sharing between the two on purpose (one's a JS
-- constant for a browser autocomplete, this is a DB table for a Deno
-- function; duplicating 22 rows once is simpler than sharing across them).

create table landmarks (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  subtitle text,
  category text not null check (category in ('terminal', 'landmark', 'stop')),
  lat double precision not null,
  lng double precision not null
);

alter table landmarks enable row level security;

create policy "public read landmarks" on landmarks for select using (true);

insert into landmarks (label, subtitle, category, lat, lng) values
  ('San Vicente Street Terminal', 'Capaya – Angeles Route Terminal', 'terminal', 15.146776, 120.614065),
  ('Pampang Road Terminal', 'Sapangbato & SM Telabastagan Terminal', 'terminal', 15.141774, 120.587892),
  ('Sunset, Nepo Terminal', 'Carmenville – Angeles Route Terminal', 'terminal', 15.135233, 120.566695),
  ('Petron Angeles City Terminal', 'Pampang – SM Telabastagan Terminal', 'terminal', 15.122731, 120.599655),
  ('Checkpoint Terminal', 'Marisol & HAU Loop Terminal', 'terminal', 15.150774, 120.592149),
  ('Marquee Mall Terminal', 'Pandan – Angeles Route Terminal', 'terminal', 15.162054, 120.608199),
  ('SMC Checkpoint Terminal', 'Balibago & Hensonville Terminal', 'terminal', 15.166711, 120.584556),
  ('Friendship Highway Terminal', 'Friendship Hwy – Angeles Terminal', 'terminal', 15.166620, 120.583175),

  ('Holy Angel University', 'Sto. Rosario St, Angeles City', 'landmark', 15.1417, 120.5934),
  ('Angeles University Foundation', 'MacArthur Hwy, Angeles City', 'landmark', 15.1435, 120.5935),
  ('JENRA Grand Mall', 'Sto. Rosario St, Angeles City', 'landmark', 15.1453, 120.5931),
  ('Nepo Mall', 'Nepo Quad, Angeles City', 'landmark', 15.1352, 120.5880),
  ('Marquee Mall', 'Pulung Maragul, Angeles City', 'landmark', 15.1620, 120.6082),
  ('SM City Telabastagan', 'MacArthur Hwy, Telabastagan', 'landmark', 15.1227, 120.5996),
  ('Bayanihan Park (Astro Park)', 'Balibago, Angeles City', 'landmark', 15.1695, 120.5880),
  ('Balibago (Fields Ave)', 'Balibago, Angeles City', 'landmark', 15.1685, 120.5895),

  ('Pampang Public Market', 'Pampang, Angeles City', 'stop', 15.1418, 120.5879),
  ('Sapangbato Proper', 'Sapangbato, Angeles City', 'stop', 15.1625, 120.5521),
  ('Carmenville', 'Carmenville Subd, Angeles City', 'stop', 15.1335, 120.5841),
  ('Capaya', 'Capaya 1 & 2, Angeles City', 'stop', 15.1468, 120.6141),
  ('Pandan', 'Pandan Road, Angeles City', 'stop', 15.1580, 120.6070),
  ('Hensonville', 'Hensonville, Angeles City', 'stop', 15.1550, 120.5833);
