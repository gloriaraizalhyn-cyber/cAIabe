-- Run in your cloud SQL Editor, after schema.sql. Safe to re-run.
--
-- schema.sql installs PostGIS into `public`, which puts its spatial_ref_sys
-- table (the standard EPSG coordinate-system definitions) behind the Data
-- API. Supabase's default grants gave anon and authenticated full write
-- access to it — verified on the live project: INSERT, UPDATE, DELETE,
-- TRUNCATE for both — and unlike every app table it has no RLS to stop
-- them. Anyone holding the public anon key could therefore empty or corrupt
-- it, which breaks every geography distance/projection the app computes
-- (route-search, driver-demand-check, the queue geofence).
--
-- The Security Advisor's suggested fix (enable RLS) doesn't apply: the
-- table is owned by the PostGIS extension, not by `postgres`, and moving
-- PostGIS to another schema would mean dropping it — and with it every
-- geography column. Revoking the write privileges closes the hole.
--
-- SELECT stays: PostGIS reads this table as the CALLING role when it
-- resolves an SRID, so anon/authenticated RPCs need to keep read access.
-- The data itself is public reference material.
--
-- After this, the advisor still lists "RLS Disabled in Public" for this
-- table; dismiss it once the check below shows SELECT only.

revoke insert, update, delete, truncate, references, trigger
  on public.spatial_ref_sys from anon, authenticated;

-- Check it — anon and authenticated should show SELECT only:
-- select grantee, string_agg(privilege_type, ', ') as privileges
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'spatial_ref_sys'
-- group by grantee;
