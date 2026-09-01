-- Run in your cloud SQL Editor. Fixes a real data-loss bug: the driver
-- registration form collects a driver's license number and franchise/
-- permit number, and validates them client-side, but driver-onboarding
-- never actually sent them anywhere — only the corresponding verification
-- PHOTOS were stored. The typed numbers were silently dropped.
alter table drivers
  add column if not exists license_number text,
  add column if not exists franchise_permit_number text;
