-- ============================================================================
-- Three policies the RLS hardening missed
-- ============================================================================
--
-- WHAT WAS FOUND
--
-- Dumping the production schema for the first time turned up three RLS policies
-- that exist on the live database and in no migration:
--
--   "anon can insert waiting_list"
--     on waiting_list        for insert to anon          with check (true)
--   "authenticated can read waiting_list"
--     on waiting_list        for select to authenticated using (true)
--   "authenticated can read waiting_list_notifications"
--     on waiting_list_notif. for select to authenticated using (true)
--
-- WHY THEY SURVIVED
--
-- The August 2026 hardening migration replaced every `auth.role() =
-- 'authenticated'` policy with one testing `is_admin()`, and dropped the old
-- ones by name:
--
--   drop policy if exists "Anyone can join waiting list"              on ...
--   drop policy if exists "Authenticated users can view waiting list" on ...
--
-- Those are the names in `20260721000002_waiting_list_and_captcha.sql`. But
-- production had been set up by pasting a differently-worded version of that
-- file into the dashboard, using lowercase names. `drop policy if exists`
-- matches on the name, found nothing, and reported no error — the `if exists`
-- is precisely what made it silent. The hardening looked like it had worked,
-- and on every database built from the migrations it had.
--
-- This is the drift the schema consolidation exists to end: nobody can spot a
-- policy that is present in one place and absent from another by reading two
-- files side by side, which is why it took a mechanical diff to find.
--
-- WHY IT MATTERS
--
-- RLS policies are OR'd together. `"Admins can manage waiting list"` requires
-- is_admin(), but `"authenticated can read waiting_list"` requires only that
-- you are logged in — and `authenticated` holds a full grant on the table. So
-- any account at all could read every waiting-list row: full name, email
-- address and phone number. That is the same hole the hardening migration was
-- written to close, still open on the one table nobody re-checked.
--
-- How reachable it is depends on whether public sign-ups are disabled in the
-- dashboard, which is the point — that is a setting, not a rule. Security here
-- fails closed, so the policy goes rather than relying on a toggle staying off.
--
-- The insert policy is inert today: `anon` was never granted INSERT on the
-- table, and Postgres checks the grant before it consults RLS. It goes too,
-- because the next person to add a grant should not be reinstating a public
-- write path by accident.
-- ============================================================================

drop policy if exists "anon can insert waiting_list"
  on public.waiting_list;

drop policy if exists "authenticated can read waiting_list"
  on public.waiting_list;

drop policy if exists "authenticated can read waiting_list_notifications"
  on public.waiting_list_notifications;

-- Leaves "Admins can manage waiting list" and "Admins can manage waiting list
-- notifications" as the only policies on these two tables, which is what every
-- other table holding personal data already looks like.
--
-- The public write path is unaffected: /api/register/waiting-list uses the
-- service key, which bypasses RLS entirely, and that is what keeps the CAPTCHA
-- and the validation mandatory.
