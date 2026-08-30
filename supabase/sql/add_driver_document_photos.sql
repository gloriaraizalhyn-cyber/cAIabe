-- Run in your cloud SQL Editor. The registration form has always collected
-- three verification photos (driver's license, franchise/permit, vehicle
-- registration), but only the license photo was ever actually stored —
-- `drivers` had no columns for the other two, so they were silently
-- dropped on submit. This adds the missing columns so all three can be
-- uploaded and reviewed by admins.

alter table drivers add column if not exists franchise_permit_photo_url text;
alter table drivers add column if not exists vehicle_registration_photo_url text;
