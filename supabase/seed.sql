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
-- The one privilege this database has that production deliberately does not
-- ---------------------------------------------------------------------------
-- 20260912000000_converge_role_grants.sql seals `admins` off from every role
-- reachable through the API, so a leaked service key cannot write itself into
-- the list that decides who may enter /admin. Production keeps it sealed.
--
-- The Playwright suite needs one hole in that. The password-reset specs create a
-- throwaway administrator per test — the shared one cannot be used for a test
-- that changes a password — and creating it means inserting here with the
-- service key.
--
-- Granting it in this file rather than in the migration is what keeps the two
-- honest. seed.sql runs on `supabase db reset` and `supabase start` and nowhere
-- else, never against the live project, by construction. So the difference is
-- declared, local, and one line long rather than an accident nobody wrote down.
--
-- It cannot grow into a "works locally, fails live" bug, because no application
-- code reads or writes this table: proxy.ts and lib/is-admin.ts both authorise
-- through the security-definer is_admin() instead. A test in
-- tests/ui-consistency.spec.ts fails if that ever stops being true.
grant select, insert, delete on table public.admins to service_role;


-- ===========================================================================
-- Demo content
-- ===========================================================================
--
-- ALL OF THIS IS INVENTED. Not one word came from the instructor and none of it
-- is true. That is fine here and nowhere else: this file only ever runs against
-- a throwaway local database, and the rule against invented copy exists to stop
-- plausible filler reaching a visitor. What it is for is making the pages look
-- like a real site while the design is being worked on — empty pages hide
-- layout problems, and a page with one blog post does not show what a page with
-- five looks like.
--
-- The Playwright specs create and clean up their own rows, so nothing below is
-- load bearing for the suite: deleting it should never turn the tests red.
--
-- Photographs come from /public/mock, built from the throwaway pictures in
-- ./mock-images by `npm run mock:images`.


-- ---------------------------------------------------------------------------
-- Her words and pictures
-- ---------------------------------------------------------------------------
-- These rows already exist — the baseline seeds every key with an empty string
-- so the admin screen has something to render — so this fills them in rather
-- than inserting. An empty value makes the public pages draw a visible
-- placeholder, which is the honest default but tells you nothing about
-- spacing, line length or how a portrait sits next to a headline.

update public.site_content set value_ro = v.ro, value_en = v.en
from (values
  ('home.hero_title',
   'Îți ghidez călătoria către echilibru',
   'Guiding your journey towards balance'),
  ('home.hero_subtitle',
   'Yoga pentru corp, minte și suflet, în grupuri mici, la Cluj-Napoca.',
   'Yoga for body, mind and soul, in small groups, in Cluj-Napoca.'),
  ('home.hero_image', '/mock/hero.webp', null),
  ('home.intro',
   '<p>Predau de nouă ani și încă învăț ceva la fiecare oră. Lucrez cu grupuri mici pentru că fiecare corp are nevoie de altceva, iar asta nu se vede dintr-o sală plină.</p><p>Nu e nevoie să fii flexibil. E nevoie doar să vii.</p>',
   '<p>I have been teaching for nine years and I still learn something in every class. I work with small groups because every body needs something different, and that is invisible from the front of a full room.</p><p>You do not need to be flexible. You only need to turn up.</p>'),
  ('about.title', 'Despre mine', 'About me'),
  ('about.portrait', '/mock/about.webp', null),
  ('about.body',
   '<p>Am început yoga într-o perioadă în care nu mai dormeam bine. Am rămas pentru liniștea de după, nu pentru poziții.</p><p>Acum predau ceea ce m-a ajutat pe mine: practică blândă, respirație, timp de oprire. Orele mele sunt pentru oameni care stau mult la birou, care au dureri de spate, care nu au mai făcut sport de ani buni. Nimeni nu e prea rigid și nimeni nu e prea începător.</p>',
   '<p>I came to yoga during a stretch when I had stopped sleeping properly. I stayed for the quiet afterwards, not for the poses.</p><p>Now I teach what helped me: gentle practice, breath, time to stop. My classes are for people who sit at a desk all day, who have a sore back, who have not exercised in years. Nobody is too stiff and nobody is too new.</p>'),
  ('about.credentials',
   '<p>Formare de 200 de ore Hatha Yoga, Rishikesh.<br>Formare de 300 de ore Yin &amp; Restorative, Barcelona.<br>Curs de anatomie aplicată pentru profesori, online.</p>',
   '<p>200-hour Hatha Yoga training, Rishikesh.<br>300-hour Yin &amp; Restorative training, Barcelona.<br>Applied anatomy for teachers, online.</p>')
) as v(key, ro, en)
where public.site_content.key = v.key;

-- The footer renders an icon only when there is an address behind it, so these
-- two also decide whether the "follow me" block appears at all.
update public.site_content set value_ro = '@yoga.cu.maria'
 where key = 'contact.instagram_url';
update public.site_content set value_ro = 'facebook.com/yoga.cu.maria'
 where key = 'contact.facebook_url';


-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
-- Arranged to exercise the home page's ordering rule rather than just to fill
-- space. The home page shows three events, and an event that is full gives up
-- its place to a later one that still has room — so:
--
--   +5d   respiratie-de-dimineata   FULL (10 of 10)   <- soonest, and skipped
--   +12d  atelier-yoga-si-jurnal    4 of 12           <- becomes the lead card
--   +19d  yoga-in-parc              6 of 20
--   +38d  retreat-de-weekend        2 of 8
--   +54d  seara-de-yin-si-sunet     uncapped
--
-- so the three on the home page start at +12d and the soonest event is visibly
-- absent — which is the rule working. Cancel a registration on the +5d event
-- (delete one row from public.registrations) and it should reappear at the top.
--
-- `atelier-yoga-si-jurnal` deliberately has NO image. It is the lead card, which
-- is the only place on the home page that renders an event photograph, so this
-- is what shows how that card copes without one. Give it '/mock/event-1.webp'
-- to see the other way round.

insert into public.events (slug, title_ro, title_en, description_ro, description_en, date, time, location, price, currency, max_participants, image_url, published)
values
  (
    'respiratie-de-dimineata',
    'Respirație de dimineață',
    'Morning breathwork',
    'Patruzeci de minute de respirație și mișcare lentă, înainte de serviciu. Vino cu ce ai, pleci treaz.',
    'Forty minutes of breathwork and slow movement before work. Come as you are, leave awake.',
    current_date + 5, '07:30', 'Cluj-Napoca', 40, 'RON', 10, '/mock/event-1.webp', true
  ),
  (
    'atelier-yoga-si-jurnal',
    'Atelier de yoga și jurnal',
    'Yoga and journaling workshop',
    'O dimineață de practică blândă urmată de scriere reflexivă. Aduci un caiet, restul se întâmplă.',
    'A morning of gentle practice followed by reflective writing. Bring a notebook, the rest takes care of itself.',
    current_date + 12, '10:00', 'Cluj-Napoca', 0, 'RON', 12, null, true
  ),
  (
    'yoga-in-parc',
    'Yoga în parc',
    'Yoga in the park',
    'Practică în aer liber în Parcul Central, pe iarbă, cu saltelele noastre. Dacă plouă, ne mutăm în sală.',
    'An outdoor practice in the Central Park, on the grass, on our own mats. If it rains we move indoors.',
    current_date + 19, '18:30', 'Parcul Central, Cluj-Napoca', 25, 'RON', 20, '/mock/event-2.webp', true
  ),
  (
    'retreat-de-weekend',
    'Retreat de weekend',
    'Weekend retreat',
    'Două zile de practică, respirație și liniște la marginea pădurii. Cazare și mese incluse.',
    'Two days of practice, breathwork and quiet at the edge of the forest. Room and meals included.',
    current_date + 38, '09:00', 'Brașov', 350, 'RON', 8, '/mock/event-3.webp', true
  ),
  (
    'seara-de-yin-si-sunet',
    'Seară de yin și sunet',
    'An evening of yin and sound',
    'Poziții ținute lung, pături, și boluri tibetane în ultima jumătate de oră. Se pleacă foarte încet.',
    'Long-held poses, blankets, and singing bowls for the last half hour. People leave very slowly.',
    current_date + 54, '19:00', 'Cluj-Napoca', 60, 'RON', null, '/mock/event-4.webp', true
  )
on conflict (slug) do nothing;

-- Fill the soonest event to capacity so the ordering rule has something to do.
--
-- `event_availability` counts registrations that are neither refunded nor an
-- expired pending hold, so ten plain 'free' rows is exactly ten seats gone.
insert into public.registrations (event_id, full_name, email, phone, payment_status)
select e.id,
       'Participant ' || n,
       'participant' || n || '@example.test',
       '+4072111' || lpad(n::text, 4, '0'),
       'free'
from public.events e, generate_series(1, 10) as n
where e.slug = 'respiratie-de-dimineata'
  -- `db reset` drops the database first so this can only run once, but the file
  -- is also runnable by hand and registrations have no natural unique key to
  -- conflict on. Without the guard a second run silently books twenty seats on
  -- a ten-seat event.
  and not exists (select 1 from public.registrations r where r.event_id = e.id);

-- A couple of seats taken on the others, so the counters show something other
-- than "all free" and the lead card has a believable number on it.
insert into public.registrations (event_id, full_name, email, phone, payment_status)
select e.id,
       'Participant ' || e.slug || ' ' || n,
       'p' || n || '.' || e.slug || '@example.test',
       '+4072222' || lpad(n::text, 4, '0'),
       'free'
from public.events e
cross join lateral generate_series(1, case e.slug
         when 'atelier-yoga-si-jurnal' then 4
         when 'yoga-in-parc'           then 6
         when 'retreat-de-weekend'     then 2
         else 0 end) as n
where e.slug in ('atelier-yoga-si-jurnal', 'yoga-in-parc', 'retreat-de-weekend')
  and not exists (select 1 from public.registrations r where r.event_id = e.id);


-- ---------------------------------------------------------------------------
-- Blog
-- ---------------------------------------------------------------------------
-- `created_at` is set explicitly and spread over five months, because the home
-- page shows the three most recent and every row defaulting to now() would make
-- that choice arbitrary.

insert into public.blog_posts (slug, title_ro, title_en, content_ro, content_en, published, hidden, created_at)
values
  (
    'de-ce-respiratia-conteaza',
    'De ce respirația contează',
    'Why breath matters',
    '<p>Respirația este primul lucru pe care îl învățăm și ultimul la care ne gândim.</p><h2>Unde începe practica</h2><p>Începe cu o singură inspirație conștientă. Nu cu o poziție, nu cu o saltea scumpă, nu cu un abonament.</p><p>Dacă respiri pe nas, încet, timp de un minut, corpul înțelege că nu e nicio urgență. Restul vine de la sine.</p>',
    '<p>Breath is the first thing we learn and the last thing we think about.</p><h2>Where practice begins</h2><p>It begins with a single conscious breath. Not with a pose, not with an expensive mat, not with a membership.</p><p>Breathe through your nose, slowly, for one minute, and the body works out that nothing is on fire. The rest follows.</p>',
    true, false, now() - interval '6 days'
  ),
  (
    'cinci-minute-dimineata',
    'Cinci minute dimineața fac mai mult decât o oră sâmbăta',
    'Five minutes each morning beats an hour on Saturday',
    '<p>Toată lumea vrea practica lungă. Aproape nimeni nu o face.</p><p>Cinci minute, în fiecare zi, la aceeași oră, schimbă mai mult decât o oră pe care o amâni până săptămâna viitoare. Nu pentru că sunt magice, ci pentru că se întâmplă.</p>',
    '<p>Everyone wants the long practice. Almost nobody does it.</p><p>Five minutes, every day, at the same time, changes more than an hour you keep postponing until next week. Not because five minutes are magic, but because they actually happen.</p>',
    true, false, now() - interval '3 weeks'
  ),
  (
    'ce-sa-aduci-la-prima-ora',
    'Ce să aduci la prima oră',
    'What to bring to your first class',
    '<p>Haine în care te poți mișca și o sticlă de apă. Atât.</p><p>Saltelele sunt la sală. Nu ai nevoie de nimic special și nu trebuie să te pregătești. Dacă vii direct de la birou, e în regulă — jumătate din sală vine tot de acolo.</p>',
    '<p>Clothes you can move in and a bottle of water. That is all.</p><p>Mats are here. You need nothing special and there is nothing to prepare. If you are coming straight from the office, that is fine — half the room does.</p>',
    true, false, now() - interval '2 months'
  ),
  (
    'despre-flexibilitate',
    'Nu trebuie să fii flexibil ca să începi',
    'You do not need to be flexible to start',
    '<p>Este cel mai des motiv pentru care oamenii amână și cel mai puțin întemeiat.</p><p>Flexibilitatea nu e condiția de intrare, e una dintre consecințe. Nimeni nu se apucă de înot pentru că știe deja să înoate.</p>',
    '<p>It is the most common reason people put it off and the least sound one.</p><p>Flexibility is not the entry requirement, it is one of the outcomes. Nobody takes up swimming because they can already swim.</p>',
    true, false, now() - interval '3 months'
  ),
  (
    'yoga-si-durerile-de-spate',
    'Yoga și durerile de spate: ce ajută și ce nu',
    'Yoga and back pain: what helps and what does not',
    '<p>Câteva lucruri ajută aproape pe toată lumea și câteva înrăutățesc lucrurile aproape pentru toată lumea.</p><h2>Spune-mi înainte de oră</h2><p>Dacă ai o problemă la spate, spune-mi la început, nu la sfârșit. Pot schimba jumătate din oră pentru tine fără ca cineva să observe.</p>',
    '<p>A few things help nearly everyone and a few make it worse for nearly everyone.</p><h2>Tell me before the class</h2><p>If your back is a problem, say so at the start rather than at the end. I can change half the class for you without anyone noticing.</p>',
    true, false, now() - interval '5 months'
  )
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- Testimonials
-- ---------------------------------------------------------------------------
-- Each points at an event, which the schema requires. Four are approved and one
-- is left pending on purpose, so the admin moderation screen has something
-- waiting in it and the dashboard's "pending" counter is not zero.

insert into public.testimonials (event_id, type, content, author_name, rating, approved)
select e.id, 'text', v.content, v.author, v.rating, v.approved
from (values
  ('atelier-yoga-si-jurnal',
   'Am plecat mai ușoară decât am venit. Nu știu cum altfel să spun.',
   'Ioana M.', 5, true),
  ('yoga-in-parc',
   'Prima oară când am făcut yoga afară. M-am simțit caraghioasă cinci minute și apoi deloc.',
   'Andreea P.', 5, true),
  ('retreat-de-weekend',
   'Două zile fără telefon și cu oameni cumsecade. M-am întors alt om luni dimineața.',
   'Cristina D.', 5, true),
  ('respiratie-de-dimineata',
   'Vin înainte de serviciu de trei luni. Singurul lucru pe care l-am ținut din ianuarie.',
   'Bogdan A.', 4, true),
  ('seara-de-yin-si-sunet',
   'Boluri, pături, întuneric. Am adormit la final și nimeni nu m-a trezit.',
   'Raluca T.', 5, false)
) as v(slug, content, author, rating, approved)
join public.events e on e.slug = v.slug
where not exists (
  select 1 from public.testimonials t where t.content = v.content
);


-- ---------------------------------------------------------------------------
-- Frequently asked questions
-- ---------------------------------------------------------------------------
-- These answer what actually stalls a booking. The home page renders them as a
-- <details> accordion and publishes them as schema.org FAQPage, which is how
-- "ce să aduc la yoga" turns into someone finding the site.
--
-- Guarded by `not exists` on the question, not by `on conflict`. `faqs` has no
-- unique constraint on anything — its only key is a generated uuid — and
-- `on conflict do nothing` with nothing to conflict against is not a safety
-- net, it is a no-op that reads like one. This file is runnable by hand as well
-- as by `db reset`, and a second run used to double every question, in the
-- accordion and in the FAQPage markup both.

insert into public.faqs (question_ro, question_en, answer_ro, answer_en, sort_order, published)
select v.question_ro, v.question_en, v.answer_ro, v.answer_en, v.sort_order, v.published
from (values
  (
    'Trebuie să fiu flexibil ca să vin?',
    'Do I need to be flexible to come?',
    'Nu. Este cel mai frecvent motiv pentru care oamenii amână și nu are nicio bază — flexibilitatea vine din practică, nu înaintea ei. Grupurile sunt mici tocmai ca să pot adapta pentru fiecare.',
    'No. It is the most common reason people put it off and it has no basis — flexibility comes out of practice, not before it. The groups are small precisely so I can adapt things for each person.',
    10, true
  ),
  (
    'Ce trebuie să aduc?',
    'What should I bring?',
    'Haine în care te poți mișca și o sticlă de apă. Saltelele, păturile și blocurile sunt la sală.',
    'Clothes you can move in and a bottle of water. Mats, blankets and blocks are here.',
    20, true
  ),
  (
    'Am dureri de spate. Pot participa?',
    'I have back pain. Can I still join?',
    'Da, dar spune-mi înainte de oră, nu după. Majoritatea pozițiilor au o variantă mai blândă și pot schimba ce e nevoie fără să atrag atenția asupra ta.',
    'Yes, but tell me before the class rather than after. Most poses have a gentler version and I can change whatever is needed without drawing attention to you.',
    30, true
  ),
  (
    'Cum plătesc și ce se întâmplă dacă nu pot ajunge?',
    'How do I pay, and what if I cannot make it?',
    'Plata se face online la înscriere, cu cardul. Dacă anunți cu cel puțin 24 de ore înainte, îți mut locul la altă dată sau primești banii înapoi.',
    'You pay online by card when you book. Let me know at least 24 hours in advance and I will move your place to another date or refund you.',
    40, true
  ),
  (
    'Locurile s-au terminat. Ce pot face?',
    'The event is full. What can I do?',
    'Înscrie-te pe lista de așteptare de pe pagina evenimentului. Dacă se eliberează un loc, primești un email cu un link valabil 24 de ore, în ordinea în care v-ați înscris.',
    'Join the waiting list on the event page. If a seat frees up you will get an email with a link that is valid for 24 hours, in the order people signed up.',
    50, true
  )
) as v(question_ro, question_en, answer_ro, answer_en, sort_order, published)
where not exists (
  select 1 from public.faqs f where f.question_ro = v.question_ro
);
