-- Run in your cloud SQL Editor. Adds a place to record why a driver
-- application was rejected, so the reason is visible later (to the admin
-- reviewing history, and eventually to the driver themself) instead of
-- just a bare "rejected" status.

alter table drivers add column if not exists rejection_reason text;
