-- Run this in SQL Editor (cloud project) once, before using driver-onboarding.
-- Creates a PRIVATE bucket for license photos — not publicly readable, since
-- these are sensitive documents. Only the service role (used inside Edge
-- Functions) can read/write freely; admin review tooling (out of scope for
-- now) would use signed URLs to view them later.

insert into storage.buckets (id, name, public)
values ('license-photos', 'license-photos', false)
on conflict (id) do nothing;

-- No public policies are added on purpose. All access goes through the
-- driver-onboarding Edge Function (service role), which is intentional —
-- drivers upload via the function, not directly to Storage.
