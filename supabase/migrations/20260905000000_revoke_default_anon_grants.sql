-- Take away the privileges anon was never meant to have.
--
-- WHAT WAS WRONG
--
-- Supabase's project setup runs
--
--   alter default privileges in schema public grant all on tables to anon;
--
-- "all" means all, and what a role actually inherits depends on when and where
-- the database was built. The two environments here do not agree, which is the
-- real finding. Measured, not assumed — both by asking Postgres directly:
--
--                       production            rebuilt from these migrations
--   whatsapp_links      REF, TRG, TRUNC       SELECT, INSERT, UPDATE, DELETE
--   site_content        REF, TRG, TRUNC, SEL  SELECT, INSERT, UPDATE, DELETE
--   faqs                REF, TRG, TRUNC, SEL  SELECT, INSERT, UPDATE, DELETE
--   profiles            REF, TRG, TRUNC, SEL  SELECT, INSERT, UPDATE, DELETE
--   event_availability  REF, TRG, TRUNC, SEL  SELECT, INSERT, UPDATE, DELETE
--
-- The baseline's note about this is accurate about *production* — REFERENCES,
-- TRIGGER, TRUNCATE and MAINTAIN is exactly what the live database carries, and
-- its conclusion that the tables stay unreadable is correct there. What it does
-- not say, because nobody had checked, is that replaying the file no longer
-- reproduces that state: a current Supabase CLI hands the same tables full DML
-- for anon instead. The baseline is meant to rebuild production exactly, and on
-- these five objects it does not.
--
-- The explicit `revoke ... from anon` lines in the baseline are why events,
-- blog_posts and testimonials come out identical in both. The tables added
-- later never got the same treatment, because an inherited grant is invisible:
-- no migration mentions it, and `pg_dump` does not print default privileges as
-- table grants — which is why the August dump-diff reported production and the
-- baseline as matching. That is the second time this blind spot has hidden
-- something, after the PUBLIC execute grant on register_for_event.
--
-- WHAT WAS AND WAS NOT EXPOSED
--
-- Nothing, in either environment. Production never had anon INSERT, UPDATE or
-- DELETE at all. On a rebuilt database it did, and RLS still held: an anonymous
-- SELECT on whatsapp_links returns `[]`, INSERT is refused outright, and UPDATE
-- and DELETE match zero rows — verified against seeded canary rows rather than
-- trusting the HTTP status, because PostgREST answers 200/204 for a write that
-- changed nothing.
--
-- So this is not a leak being closed. It is the second lock going back on a
-- door that still had one, and the two environments being made to agree. The
-- design here is deliberately two independent layers — a GRANT saying who may
-- attempt an operation, an RLS policy saying which rows they may touch —
-- because RLS alone fails silently, and this project has already shipped three
-- policies to production that did not do what their names claimed.
--
-- TRUNCATE is the one production privilege worth removing on its own merit:
-- it ignores RLS entirely, so no policy would contain it. It is not reachable
-- today — PostgREST issues only SELECT/INSERT/UPDATE/DELETE, and the only
-- functions anon may execute are is_admin and pending_hold_interval, neither of
-- which truncates — but "unreachable through the front door we know about" is a
-- weaker guarantee than not holding the privilege.
--
-- WHY NOT JUST CHANGE THE DEFAULT PRIVILEGES
--
-- `alter default privileges in schema public revoke all on tables from anon`
-- would stop this at the source. It is deliberately not done here: that
-- default is part of Supabase's own project setup, the platform re-applies and
-- relies on it, and overriding it makes this database behave unlike every
-- other Supabase project for anyone who later looks at it. The narrow fix is
-- the honest one — revoke what this schema actually has, and make the
-- checklist in docs/DATABASE.md carry the rule for tables added next.

-- Wrapped explicitly, because site_content and faqs are read by every page load
-- on the public site. Each table below is revoked and then re-granted SELECT,
-- and between those two statements anon can read nothing. Applied statement by
-- statement against production that gap is real, if brief: the home page would
-- render its content placeholders instead of the instructor's copy for anyone
-- who loaded it at that moment. The CLI already wraps a migration file in a
-- transaction; this makes the same guarantee hold when the file is pasted into
-- the SQL Editor by hand, which is how production actually gets its schema.
begin;

-- whatsapp_links: no anonymous access of any kind. A WhatsApp invite URL is a
-- capability — anyone holding it can join the instructor's group — so this is
-- the one table where an anonymous caller should get a hard permission error
-- rather than an empty list. tests/admin-events.spec.ts asserts exactly that,
-- and was the test that caught this.
revoke all on public.whatsapp_links from anon;

-- The rest are genuinely public to *read* and must never be writable. The
-- SELECT grants from the baseline are re-stated after each revoke rather than
-- revoking piecemeal, so the end state is written out plainly instead of being
-- inferred from what was subtracted.
revoke all on public.site_content       from anon;
revoke all on public.faqs               from anon;
revoke all on public.profiles           from anon;
revoke all on public.event_availability from anon;

grant select on public.site_content       to anon;
grant select on public.faqs               to anon;
grant select on public.event_availability to anon;

-- profiles is unused (there is no public sign-up) and its RLS restricts every
-- row to `auth.uid() = id`, so this grant reaches nothing. Kept because the
-- baseline documents production as having it; the write privileges are the
-- part that had to go.
grant select on public.profiles to anon, authenticated;

commit;

-- Verification, for whoever runs this next. Expect SELECT and nothing else for
-- the four public-read objects, and no row at all for whatsapp_links:
--
--   select table_name, grantee,
--          string_agg(privilege_type, ', ' order by privilege_type) as privs
--   from information_schema.role_table_grants
--   where grantee = 'anon' and table_schema = 'public'
--   group by table_name, grantee
--   order by table_name;
