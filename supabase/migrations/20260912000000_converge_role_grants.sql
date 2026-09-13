-- ---------------------------------------------------------------------------
-- Make the two databases agree about who may touch what
-- ---------------------------------------------------------------------------
--
-- WHAT WAS WRONG
--
-- Dumping both schemas and diffing the grants found five places where the local
-- database was MORE permissive than production:
--
--   object                 role             production            local
--   ---------------------  ---------------  --------------------  -----
--   is_admin()             service_role     (no grant)            EXECUTE
--   admins                 service_role     no S/I/U/D            ALL
--   profiles               service_role     no S/I/U/D            ALL
--   profiles               authenticated    SELECT only           ALL
--   event_availability     authenticated    SELECT only           ALL
--   event_availability     service_role     SELECT only           ALL
--
-- That direction is the dangerous one. A schema where the development database
-- allows more than the live one is how a query passes every test and then fails
-- in production with `permission denied` — which has already shipped from this
-- repository twice, and is why grants are declared in migrations at all.
--
-- Nothing actually used any of them, which is why this had not bitten yet:
-- no application code queries `admins` or `profiles`, `proxy.ts` and
-- `lib/is-admin.ts` both authorise through the `is_admin()` RPC rather than by
-- reading the table, and `event_availability` is a view read with SELECT in
-- four places and written in none.
--
-- WHY NARROW LOCAL RATHER THAN WIDEN PRODUCTION
--
-- Because on `admins` production's setting turns out to be worth keeping. That
-- table has no grants for anon or authenticated, no RLS policies at all, and —
-- with these privileges withheld from service_role too — is simply unreachable
-- through the API by any role. Only the `postgres` superuser and the
-- security-definer `is_admin()` can see it.
--
-- That is a real control rather than an accident: the service key is held by the
-- API routes, and if it ever leaked, the holder would get every row of every
-- other table but still could not write themselves into the list that decides
-- who may enter /admin. The authorisation root stays out of reach of the
-- credential most likely to escape.
--
-- On the other four there is nothing to weigh: they are privileges no code
-- holds, on a view where INSERT and UPDATE mean nothing and a table nothing
-- reads. Least privilege wins by default when nothing is on the other side.
--
-- APPLIED TO PRODUCTION, THIS DOES NOTHING
--
-- Every statement below revokes a privilege production has already lost, and
-- revoking a privilege that is not held is a no-op. It runs there to put the
-- state in the migration history rather than to change anything — which is the
-- point, because the next person to rebuild this schema from the repository
-- should get production's permissions and not a looser set.
--
-- ONE DELIBERATE EXCEPTION, AND IT LIVES IN seed.sql
--
-- The Playwright suite creates a throwaway administrator per test, which means
-- inserting a row into `admins` with the service key — exactly what the first
-- statement below forbids. That grant is re-added in supabase/seed.sql, which
-- only ever runs against a local database. Production keeps the table sealed;
-- the test harness gets the one privilege it needs, in the file whose whole
-- purpose is local scaffolding, with a comment saying so.
--
-- It is safe to be inconsistent there precisely because no application code
-- touches `admins` — tests/ui-consistency.spec.ts asserts that, so the
-- exception cannot quietly grow into a code path that works locally and fails
-- live.

begin;

-- Nothing calls is_admin() as the service role. It reads auth.uid(), which is
-- null for a key that carries no user, so it could only ever return false.
revoke execute on function public.is_admin() from service_role;

-- The authorisation root. See the note above for why this one is not simply
-- brought into line with the eleven tables where service_role holds ALL.
revoke select, insert, update, delete on table public.admins from service_role;

-- Unused entirely — there is no public sign-up, so no profile is ever written.
-- anon and authenticated keep the SELECT granted in
-- 20260905000000_revoke_default_anon_grants.sql.
revoke insert, update, delete on table public.profiles from authenticated;
revoke select, insert, update, delete on table public.profiles from service_role;

-- A view, and an aggregate one. SELECT is the only privilege on it that can do
-- anything; the rest were noise that made the dumps disagree.
revoke insert, update, delete on table public.event_availability
  from authenticated, service_role;

commit;
