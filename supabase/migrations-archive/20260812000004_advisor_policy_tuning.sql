-- ============================================================================
-- Three things the Supabase advisors were right about
-- ============================================================================
--
-- None of these is a hole. They are worth fixing anyway, because the advisor
-- panel is only useful if what remains on it is deliberate — this session found
-- a real vulnerability (see 20260812000003) sitting in a list of thirty-odd
-- warnings, and noise is what let it sit there.
--
-- What is deliberately NOT changed, and why, is at the bottom of this file.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Stop the public bucket listing its own contents
-- ---------------------------------------------------------------------------
-- `"Anyone can view media files"` granted SELECT on storage.objects to every
-- role, which is what lets a client call storage.list() and enumerate every
-- file in the bucket.
--
-- A public bucket does not need that policy to serve files. Requests to
-- /storage/v1/object/public/media/... are served without consulting RLS at all
-- — that is what "public" means — so images on the website keep working.
-- The policy only ever governed *listing*.
--
-- Restricted to `authenticated` because one thing does need to list: the admin
-- media library (components/admin/media-library.tsx) calls
-- `supabase.storage.from("media").list()` from the browser with the instructor's
-- own session rather than through an API route.
drop policy if exists "Anyone can view media files" on storage.objects;

create policy "Signed-in users can list media files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'media');


-- ---------------------------------------------------------------------------
-- 2. Evaluate auth.uid() once per query, not once per row
-- ---------------------------------------------------------------------------
-- Postgres treats a bare `auth.uid()` in a policy as volatile per row, so it is
-- re-evaluated for every row scanned. Wrapping it in a scalar subquery makes it
-- an InitPlan: computed once, then compared.
--
-- The effect here is nil — `profiles` is unused and empty. It is fixed because
-- it is the pattern, and the next policy someone writes will be copied from an
-- existing one.
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using ((select auth.uid()) = id);


-- ---------------------------------------------------------------------------
-- 3. Keep the admin policies away from anonymous visitors
-- ---------------------------------------------------------------------------
-- Every content table carries two permissive policies: a public one
-- (`published = true`) and an admin one (`is_admin()`). Permissive policies are
-- OR'd, so both were evaluated on every anonymous read — meaning every visitor
-- to the events page ran `is_admin()`, a subquery against a table they have no
-- business touching, to be told "no" every time.
--
-- Adding `to authenticated` scopes the admin policy to logged-in requests. The
-- behaviour is identical, because an anonymous caller could never satisfy
-- `is_admin()` — `auth.uid()` is null, so the lookup finds nothing. What
-- changes is that anonymous reads now evaluate one policy instead of two.
--
-- This is the common path by a wide margin: almost every visitor arrives from
-- Instagram, logged into nothing.
--
-- service_role is unaffected either way; it bypasses RLS entirely.

drop policy if exists "Admins can manage events" on public.events;
create policy "Admins can manage events" on public.events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage posts" on public.blog_posts;
create policy "Admins can manage posts" on public.blog_posts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage testimonials" on public.testimonials;
create policy "Admins can manage testimonials" on public.testimonials
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage site content" on public.site_content;
create policy "Admins can manage site content" on public.site_content
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage faqs" on public.faqs;
create policy "Admins can manage faqs" on public.faqs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage registrations" on public.registrations;
create policy "Admins can manage registrations" on public.registrations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage contact messages" on public.contact_messages;
create policy "Admins can manage contact messages" on public.contact_messages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage email templates" on public.email_templates;
create policy "Admins can manage email templates" on public.email_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage waiting list" on public.waiting_list;
create policy "Admins can manage waiting list" on public.waiting_list
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage waiting list notifications" on public.waiting_list_notifications;
create policy "Admins can manage waiting list notifications" on public.waiting_list_notifications
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage whatsapp links" on public.whatsapp_links;
create policy "Admins can manage whatsapp links" on public.whatsapp_links
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- Advisor findings deliberately left alone
-- ============================================================================
--
-- ERROR  security_definer_view on event_availability
--        The view runs with its creator's privileges so it can read
--        `registrations`, which the caller cannot. That is the entire point:
--        turning on `security_invoker` would let RLS filter the registrations
--        away and every event would report zero seats taken — the exact bug
--        that hid the waiting list for weeks. It is safe because the view
--        returns an id, a capacity and a count, and no row-level data at all.
--        Aggregation is the privacy boundary. This finding is expected to stay
--        on the panel permanently.
--
-- WARN   is_admin() executable by anon and authenticated
--        Required, not accidental. RLS policy expressions are evaluated with
--        the caller's privileges, so any role reading a table with an
--        `is_admin()` policy needs EXECUTE. Revoking it would replace working
--        pages with "permission denied for function is_admin". It discloses
--        nothing: it answers only about the caller, and returns false for
--        anyone anonymous. Asserted in tests/rpc-exposure.spec.ts.
--
-- INFO   rls_enabled_no_policy on admins
--        Intentional. RLS on with no policy denies everyone, which is correct:
--        the table is read only by is_admin(), which is SECURITY DEFINER and
--        does not consult RLS. A policy here would only widen access.
--
-- INFO   unindexed_foreign_keys on registrations.user_id,
--        testimonials.user_id, waiting_list.claimed_registration_id
--        The two user_id columns reference `profiles`, which is vestigial and
--        always null — there is no public sign-up. An index on a column that is
--        null in every row costs writes and buys nothing. Revisit if user
--        accounts ever exist.
--
-- INFO   unused_index on idx_waiting_list_event and idx_waiting_list_claimed
--        Accurate: the waiting list has had almost no traffic. Kept because
--        "never used yet" and "not needed" are different claims, and these
--        support the admin waiting-list view that will be used once an event
--        actually fills. Worth revisiting once there is real usage — note that
--        idx_waiting_list_event_unclaimed already leads with event_id, so
--        idx_waiting_list_event is a redundant prefix and is the one to drop
--        first.
--
-- WARN   auth_leaked_password_protection
--        A dashboard setting, not schema: Authentication → Passwords → check
--        against HaveIBeenPwned. Nothing in a migration can turn it on.
-- ============================================================================
