-- Run in your cloud SQL Editor. Adds the delete counterpart to the
-- read/update admin policies from add_admins.sql, for admins managing
-- driver accounts (edit/delete) from the admin dashboard.
--
-- Note: the actual delete in the admin dashboard goes through the
-- admin-delete-drivers Edge Function, which deletes the auth.users account
-- via the service role (bypassing RLS) so the drivers row cascades away
-- with it. This policy exists for defense in depth / any future direct
-- table access, matching the pattern of the existing admin policies.

create policy "admins delete all drivers" on drivers
  for delete using (exists (select 1 from admins where id = auth.uid()));
