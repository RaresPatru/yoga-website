-- ============================================================================
-- Local development / CI seed data
-- ============================================================================
--
-- Runs automatically after every migration on `supabase start` and
-- `supabase db reset`. NEVER runs against the live project.
--
-- Its main job is creating the administrator account the Playwright suite logs
-- in as. Previously the tests authenticated against the real production admin
-- account and seeded rows into the live database; this replaces that entirely.
--
-- Creating an auth user in SQL is fiddlier than it looks, because Supabase's
-- auth system keeps identity data in two tables that must agree — see below.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Test administrator
-- ---------------------------------------------------------------------------
-- Credentials match .env.test.example. They exist only on a throwaway local
-- database, so they are intentionally in plain sight.

do $$
declare
  v_user_id uuid := '00000000-0000-4000-a000-000000000001';
  v_email   text := 'playwright-admin@test.local';
begin
  -- auth.users holds the account itself. `encrypted_password` must be a bcrypt
  -- hash — GoTrue compares the login attempt against it — so we hash here with
  -- pgcrypto rather than storing the password as text.
  --
  -- `email_confirmed_at` is set to now() so the account skips the confirmation
  -- email that nothing would deliver locally.
  --
  -- The empty-string columns at the bottom are not decoration. GoTrue reads
  -- these into Go `string` fields, which cannot hold NULL, so a user created
  -- with them left as NULL produces:
  --
  --   "Scan error on column index 3, name \"confirmation_token\":
  --    converting NULL to string is unsupported"
  --
  -- and every login attempt fails with an opaque HTTP 500 "Database error
  -- querying schema". The account looks perfectly fine in the dashboard. This
  -- is the reason the earlier attempt to create an admin in SQL was abandoned
  -- in favour of clicking through the dashboard.
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    email_change,
    phone_change,
    phone_change_token,
    reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt('playwright-test-password', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  )
  on conflict (id) do nothing;

  -- auth.identities records HOW the account signs in (email, Google, GitHub...).
  -- A user without a matching identity row exists but cannot log in — password
  -- sign-in looks the identity up first. This is the step usually missed when
  -- creating users by hand in SQL.
  --
  -- `identity_data` must contain 'sub' (the user id as text) and 'email';
  -- GoTrue reads both from here.
  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    v_user_id::text,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider, provider_id) do nothing;

  -- Finally, grant admin rights. Without this the account can log in but every
  -- RLS policy returns nothing, and proxy.ts bounces it back to the login page
  -- with ?error=forbidden — which is precisely the behaviour we want for a
  -- non-admin, and precisely what we do not want for the test admin.
  insert into public.admins (user_id, email)
  values (v_user_id, v_email)
  on conflict (user_id) do nothing;
end $$;


-- ---------------------------------------------------------------------------
-- Demo content
-- ---------------------------------------------------------------------------
-- Enough to make local pages look real while working on the design. The
-- Playwright specs create and clean up their own data, so nothing here is load
-- bearing for the tests — deleting it should never turn the suite red.

insert into public.events (slug, title_ro, title_en, description_ro, description_en, date, time, location, price, max_participants, published)
values
  (
    'atelier-yoga-si-jurnal',
    'Atelier de yoga și jurnal',
    'Yoga and journaling workshop',
    '<p>O dimineață de practică blândă urmată de scriere reflexivă.</p>',
    '<p>A morning of gentle practice followed by reflective writing.</p>',
    current_date + 21,
    '10:00',
    'Cluj-Napoca',
    0,
    12,
    true
  ),
  (
    'retreat-de-weekend',
    'Retreat de weekend',
    'Weekend retreat',
    '<p>Două zile de practică, respirație și liniște.</p>',
    '<p>Two days of practice, breathwork and quiet.</p>',
    current_date + 45,
    '09:00',
    'Brașov',
    350,
    8,
    true
  )
on conflict (slug) do nothing;

insert into public.blog_posts (slug, title_ro, title_en, content_ro, content_en, published, hidden)
values (
  'de-ce-respiratia-conteaza',
  'De ce respirația contează',
  'Why breath matters',
  '<p>Respirația este primul lucru pe care îl învățăm și ultimul la care ne gândim.</p><h2>Unde începe practica</h2><p>Începe cu o singură inspirație conștientă.</p>',
  '<p>Breath is the first thing we learn and the last thing we think about.</p><h2>Where practice begins</h2><p>It begins with a single conscious breath.</p>',
  true,
  false
)
on conflict (slug) do nothing;

-- Testimonials need an event to point at, so this reuses the workshop above.
insert into public.testimonials (event_id, type, content, approved)
select id, 'text', 'Am plecat mai ușoară decât am venit. Recomand cu drag.', true
from public.events where slug = 'atelier-yoga-si-jurnal'
on conflict do nothing;
