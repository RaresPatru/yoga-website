-- ============================================================================
-- site_content + faqs: editable page copy, owned by the instructor
-- ============================================================================
--
-- WHY THIS EXISTS
--
-- The home page currently claims "10+ years · 500+ classes · 1000+ students".
-- Those numbers were invented by the code generator; nobody checked them. The
-- hero is a placeholder glyph rather than a photograph, and there is no About
-- page at all — despite every source on the subject agreeing that people book a
-- teacher, not a studio, and that the teacher's own story is the highest-value
-- content on a site like this.
--
-- The obvious fix is to hardcode her real bio and photo. That is the wrong fix:
-- it means she needs a developer every time she gets a new certification,
-- changes a photo, or reconsiders a sentence. Storing this content in the
-- database and editing it from the admin panel means the site is hers.
--
-- DESIGN: A KEY/VALUE TABLE, NOT A COLUMN PER FIELD
--
-- `site_content` is one row per piece of copy, identified by a `key` such as
-- 'about.body' or 'home.hero_title'. The alternative — a single-row table with
-- a column for every field — needs a migration each time a field is added, and
-- migrations are the slowest thing to change here.
--
-- The trade-off is honest: key/value gives up type safety, so a typo in a key
-- returns nothing rather than failing loudly. That is mitigated by defining the
-- keys in one place in the application (lib/site-content.ts) and seeding every
-- expected key below, so the admin form always shows the full set of fields.
-- ============================================================================

create table if not exists public.site_content (
  key         text primary key,
  -- Romanian is the primary language; English is optional and falls back to
  -- Romanian when empty, matching how events and blog posts already behave.
  value_ro    text not null default '',
  value_en    text,
  -- Groups fields under headings in the admin UI ('about', 'home', 'contact').
  section     text not null default 'general',
  -- Orders fields within a section.
  sort_order  integer not null default 0,
  -- 'text' renders a single-line input, 'richtext' a textarea, 'image' a media
  -- picker. Lets one admin screen edit every field without a hardcoded form.
  field_type  text not null default 'text'
    check (field_type in ('text', 'richtext', 'image')),
  -- Shown above the input so she knows what she is filling in.
  label_ro    text not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.site_content enable row level security;

-- Public content: anyone may read it, only admins may change it. Same shape as
-- the events and blog_posts policies.
drop policy if exists "Anyone can view site content" on public.site_content;
create policy "Anyone can view site content"
  on public.site_content for select
  using (true);

drop policy if exists "Admins can manage site content" on public.site_content;
create policy "Admins can manage site content"
  on public.site_content for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.site_content to anon;
grant select, insert, update, delete on public.site_content to authenticated;
grant select, insert, update, delete on public.site_content to service_role;


-- ---------------------------------------------------------------------------
-- Frequently asked questions
-- ---------------------------------------------------------------------------
-- A separate table rather than more site_content keys, because these are a
-- list of variable length that she needs to add to and reorder — which
-- key/value handles badly.
--
-- Research on retreat and workshop pages is consistent that practical
-- questions ("what should I bring?", "I have never done yoga, is that ok?")
-- are what stop someone hesitating on the booking page.

create table if not exists public.faqs (
  id          uuid primary key default gen_random_uuid(),
  question_ro text not null,
  question_en text,
  answer_ro   text not null,
  answer_en   text,
  sort_order  integer not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.faqs enable row level security;

drop policy if exists "Anyone can view published faqs" on public.faqs;
create policy "Anyone can view published faqs"
  on public.faqs for select
  using (published = true);

drop policy if exists "Admins can manage faqs" on public.faqs;
create policy "Admins can manage faqs"
  on public.faqs for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.faqs to anon;
grant select, insert, update, delete on public.faqs to authenticated;
grant select, insert, update, delete on public.faqs to service_role;

create index if not exists idx_faqs_published_order on public.faqs (published, sort_order);


-- ---------------------------------------------------------------------------
-- Seed the expected keys, empty
-- ---------------------------------------------------------------------------
-- Inserted with blank values on purpose. The admin screen lists whatever rows
-- exist, so seeding the keys is what makes the fields appear for her to fill
-- in; and the public pages treat an empty value as "not supplied yet" and show
-- a clearly-marked placeholder rather than an empty gap.
--
-- Nothing here invents facts about her. The previous hardcoded numbers are
-- deliberately not carried over.

insert into public.site_content (key, section, sort_order, field_type, label_ro, value_ro, value_en) values
  ('home.hero_title',      'home',  10, 'text',     'Titlu principal (pagina de start)', '', ''),
  ('home.hero_subtitle',   'home',  20, 'text',     'Subtitlu',                          '', ''),
  ('home.hero_image',      'home',  30, 'image',    'Fotografie principală',             '', null),
  ('home.intro',           'home',  40, 'richtext', 'Scurtă prezentare (2-3 fraze)',     '', ''),

  ('about.title',          'about', 10, 'text',     'Titlu pagina "Despre mine"',        '', ''),
  ('about.portrait',       'about', 20, 'image',    'Portret',                           '', null),
  ('about.body',           'about', 30, 'richtext', 'Povestea ta',                       '', ''),
  ('about.credentials',    'about', 40, 'richtext', 'Formare și certificări',            '', ''),

  ('contact.instagram_url','general', 10, 'text',   'Link Instagram',                    '', null),
  ('contact.email',        'general', 20, 'text',   'Email public',                      '', null)
on conflict (key) do nothing;
