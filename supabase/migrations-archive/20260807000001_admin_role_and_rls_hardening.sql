-- ============================================================================
-- Admin role + RLS hardening
-- ============================================================================
--
-- THE PROBLEM THIS FIXES
--
-- Every "admin" policy in the original schema was written as:
--     using (auth.role() = 'authenticated')
--
-- In Supabase, `auth.role()` returns 'authenticated' for ANY logged-in user.
-- It does not mean "this person is an administrator" — it only means "this
-- person is logged in at all". Because public sign-ups were enabled on the
-- project, anybody could:
--
--   1. take the publishable key out of the website's JavaScript (it is public
--      by design — that is not the flaw),
--   2. call supabase.auth.signUp() to create their own account,
--   3. confirm their email,
--   4. and immediately satisfy `auth.role() = 'authenticated'`.
--
-- At that point they could read every registration (full name, email address,
-- phone number of every person who ever signed up for an event), read private
-- contact messages, and edit or delete events and blog posts.
--
-- THE FIX
--
-- Introduce an explicit list of administrators (the `admins` table) and a
-- helper function `public.is_admin()` that answers "is the current user on
-- that list?". Every admin policy is then rewritten to call that function.
-- Being logged in is no longer enough; you must be on the list.
--
-- Run this whole file in the Supabase SQL editor. It is safe to run twice.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The list of administrators
-- ---------------------------------------------------------------------------
-- One row per person allowed into /admin. `user_id` points at Supabase's
-- built-in auth.users table, so deleting the account removes the admin rights
-- automatically (that is what `on delete cascade` does).

create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Nobody reaches this table through the public API — not even logged-in users.
-- It is read exclusively by the is_admin() function below, which runs with
-- elevated privileges. Locking it down here means a user cannot inspect or
-- modify the admin list even if a policy elsewhere is written incorrectly.
revoke all on public.admins from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Seed the current administrator(s)
-- ---------------------------------------------------------------------------
-- Before this migration, every existing account was effectively an admin.
-- To avoid locking anyone out, we grandfather in everyone who already has an
-- account. Going forward, new sign-ups get nothing.
--
-- AFTER RUNNING THIS: check the table and delete anyone who should not be
-- there:   select * from public.admins;
--          delete from public.admins where email = 'someone@example.com';

insert into public.admins (user_id, email)
select id, email from auth.users
on conflict (user_id) do nothing;


-- ---------------------------------------------------------------------------
-- 3. The is_admin() helper
-- ---------------------------------------------------------------------------
-- `auth.uid()` is a Supabase built-in that returns the ID of whoever is making
-- the current request (or NULL for anonymous visitors). So this function reads
-- as: "does a row exist in admins matching the person asking?"
--
-- Three keywords matter here:
--
--   security definer  The function runs with the permissions of its creator
--                     rather than the caller. Needed because we revoked all
--                     access to `admins` above — without this, the function
--                     could not read the table it depends on. It also prevents
--                     infinite recursion (a policy calling a function that
--                     triggers the same policy).
--
--   set search_path   Pins which schemas the function looks in. Without it, a
--                     user who can create objects could define their own
--                     `admins` table in a schema that gets searched first and
--                     trick this function into returning true. This is a
--                     well-known Postgres privilege-escalation trick, and
--                     Supabase's own database linter flags any SECURITY
--                     DEFINER function that omits it.
--
--   stable            Tells Postgres the result will not change within a
--                     single query, so it can call it once instead of once per
--                     row. Meaningful speedup when a policy runs over a table.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4. Rewrite every policy that used auth.role() = 'authenticated'
-- ---------------------------------------------------------------------------
-- `drop policy if exists` first so this file can be re-run without error.
--
-- A note on how RLS works, since it trips people up: a policy is a filter, not
-- a lock. `using (...)` decides which existing rows you may see or change;
-- `with check (...)` decides which new rows you may write. If no policy grants
-- access, the row is invisible — you get an empty result, not an error. That
-- silent-empty-result behaviour is exactly what hid the broken capacity
-- counter for so long.

-- Events -- public reads published ones; only admins write.
drop policy if exists "Admins can manage events" on public.events;
create policy "Admins can manage events"
  on public.events for all
  using (public.is_admin())
  with check (public.is_admin());

-- Registrations -- contains personal data (name, email, phone). Admin-only.
-- The public INSERT policy is removed: the website never writes here directly.
-- /api/register uses the secret service key, which bypasses RLS entirely, so
-- every registration is forced through that route where the CAPTCHA, the
-- validation and the capacity check live. Leaving a public INSERT policy open
-- would have let someone skip all three by posting straight to the database.
drop policy if exists "Anyone can insert registrations" on public.registrations;
drop policy if exists "Admins can view registrations"  on public.registrations;
create policy "Admins can manage registrations"
  on public.registrations for all
  using (public.is_admin())
  with check (public.is_admin());

-- Blog posts -- the public page also filters on `hidden`, but the policy did
-- not, so a hidden post was still readable straight from the API. Now both
-- agree.
drop policy if exists "Anyone can view published posts" on public.blog_posts;
create policy "Anyone can view published posts"
  on public.blog_posts for select
  using (published = true and hidden is not true);

drop policy if exists "Admins can manage posts" on public.blog_posts;
create policy "Admins can manage posts"
  on public.blog_posts for all
  using (public.is_admin())
  with check (public.is_admin());

-- Testimonials -- public reads approved ones. Submissions go through
-- /api/testimonials (service key + CAPTCHA), so no public INSERT policy.
drop policy if exists "Authenticated users can insert" on public.testimonials;
drop policy if exists "Admins can manage testimonials" on public.testimonials;
create policy "Admins can manage testimonials"
  on public.testimonials for all
  using (public.is_admin())
  with check (public.is_admin());

-- Contact messages -- private correspondence. Written via /api/contact with
-- the service key; read by admins only.
drop policy if exists "Anyone can insert contact messages" on public.contact_messages;
drop policy if exists "Admins can view contact messages"   on public.contact_messages;
create policy "Admins can manage contact messages"
  on public.contact_messages for all
  using (public.is_admin())
  with check (public.is_admin());

-- Email templates
drop policy if exists "Admins can manage email templates" on public.email_templates;
create policy "Admins can manage email templates"
  on public.email_templates for all
  using (public.is_admin())
  with check (public.is_admin());

-- Waiting list -- same reasoning as registrations: personal data, and the
-- public INSERT path is removed so /api/register/waiting-list (service key)
-- remains the only way in, keeping the CAPTCHA mandatory.
drop policy if exists "Anyone can join waiting list"                on public.waiting_list;
drop policy if exists "Authenticated users can view waiting list"   on public.waiting_list;
drop policy if exists "Authenticated users can update waiting list" on public.waiting_list;
create policy "Admins can manage waiting list"
  on public.waiting_list for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Authenticated users can view waiting list notifications" on public.waiting_list_notifications;
drop policy if exists "Authenticated users can insert notifications"            on public.waiting_list_notifications;
create policy "Admins can manage waiting list notifications"
  on public.waiting_list_notifications for all
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- 5. Table privileges (the layer underneath RLS)
-- ---------------------------------------------------------------------------
-- Postgres checks two separate things before letting a query through:
--
--   1. GRANT   -- "may this role touch this table at all?"
--   2. RLS     -- "which rows may it touch?"
--
-- Both must pass. The original schema only ever set up RLS policies and left
-- grants to be applied by hand in the dashboard, which is why two features
-- shipped broken with "permission denied for table ..." (see the error log in
-- the project journal — waiting_list and contact_messages both hit this).
-- Declaring grants here, in version control, is what stops that recurring.
--
-- `anon`          = a visitor who is not logged in (the website's public pages)
-- `authenticated` = a logged-in user (in practice: the instructor in /admin)
-- `service_role`  = the secret server-side key used by the API routes. It
--                   bypasses RLS completely, which is why it must never be
--                   exposed to the browser.

-- Visitors may only read public content. Nothing else, and never a write.
revoke all on public.events           from anon;
revoke all on public.blog_posts       from anon;
revoke all on public.testimonials     from anon;
revoke all on public.registrations    from anon;
revoke all on public.contact_messages from anon;
revoke all on public.waiting_list     from anon;
revoke all on public.waiting_list_notifications from anon;
revoke all on public.email_templates  from anon;

grant select on public.events       to anon;
grant select on public.blog_posts   to anon;
grant select on public.testimonials to anon;

-- Logged-in users get full CRUD at the grant level, but the RLS policies above
-- still require is_admin() for every one of those operations. A non-admin
-- account gets an empty result set rather than data.
grant select, insert, update, delete on public.events                     to authenticated;
grant select, insert, update, delete on public.blog_posts                 to authenticated;
grant select, insert, update, delete on public.testimonials               to authenticated;
grant select, insert, update, delete on public.registrations              to authenticated;
grant select, insert, update, delete on public.contact_messages           to authenticated;
grant select, insert, update, delete on public.email_templates            to authenticated;
grant select, insert, update, delete on public.waiting_list               to authenticated;
grant select, insert, update, delete on public.waiting_list_notifications to authenticated;

grant select, insert, update, delete on public.events                     to service_role;
grant select, insert, update, delete on public.blog_posts                 to service_role;
grant select, insert, update, delete on public.testimonials               to service_role;
grant select, insert, update, delete on public.registrations              to service_role;
grant select, insert, update, delete on public.contact_messages           to service_role;
grant select, insert, update, delete on public.email_templates            to service_role;
grant select, insert, update, delete on public.waiting_list               to service_role;
grant select, insert, update, delete on public.waiting_list_notifications to service_role;


-- ---------------------------------------------------------------------------
-- 6. Verify
-- ---------------------------------------------------------------------------
-- Run these by hand after applying:
--
--   -- Who are the admins? Delete anyone who should not be here.
--   select * from public.admins;
--
--   -- Should list no policy still using auth.role().
--   select tablename, policyname, qual
--   from pg_policies
--   where schemaname = 'public' and qual like '%auth.role()%';
--
-- Then, in the Supabase dashboard, turn OFF Authentication → Sign-ups →
-- "Allow new users to sign up". The instructor is the only account that ever
-- needs to exist; new ones can be created from the dashboard when needed.
-- This migration makes a stray sign-up harmless, but disabling sign-ups means
-- strangers cannot create accounts on the project at all.
-- ---------------------------------------------------------------------------
