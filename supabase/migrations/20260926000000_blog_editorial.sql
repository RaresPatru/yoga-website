-- ===========================================================================
-- Blog posts become articles: subtitle, cover, author, publish date, reading
-- time, and private changes to a post that is already live
-- ===========================================================================
--
-- What this adds, and why:
--
--   blog_posts
--     subtitle_ro / subtitle_en  An optional line under the title, on the card
--                                and on the article.
--     cover_url                  The picture on the card and at the top of the
--                                article. Optional: without one the site uses
--                                first_image below.
--     author                     The byline. Empty means "use the blog's
--                                default author" from Conținut site.
--     published_at               When the post first went live. The public
--                                pages sort and date by this, not by
--                                created_at, which is when she started writing
--                                it. Set by a trigger (section 2), so no screen
--                                has to remember to.
--     first_image                The first picture inside the Romanian text,
--                                worked out by Postgres every time the text is
--                                saved (a generated column). Nobody can write it.
--     reading_minutes_ro / _en   "5 min de citit", also worked out by Postgres:
--                                the words in the text at 200 a minute, never
--                                less than 1. Null while there is no text.
--
--   A slug format check, and `media_urls` goes: nothing has ever read or
--   written it.
--
--   content_drafts               Changes she is making to a post (and, from
--                                phase 4, an event) that is already public.
--                                Autosave writes them here, so visitors keep
--                                seeing the published version until she presses
--                                "Publică modificările". Admin only.
--
--   publish_post_draft()         Copies a post's saved changes onto the post
--                                and removes them, in one transaction.
--
--   admin_dashboard              "Drafts" stops counting hidden posts, so it
--                                matches the Ciorne tab of the post list.

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------
alter table public.blog_posts
  add column subtitle_ro  text,
  add column subtitle_en  text,
  add column cover_url    text,
  add column author       text,
  add column published_at timestamptz;

-- Posts that are already live were published, as far as anyone can tell, when
-- they were created.
update public.blog_posts set published_at = created_at where published and published_at is null;

-- The src of the first <img> in the text. substring() with a bracketed group
-- returns just the group; with no image it returns null.
alter table public.blog_posts
  add column first_image text
    generated always as (substring(content_ro from '<img[^>]*[[:space:]]src="([^"]+)"')) stored;

-- Words: the text with its tags replaced by spaces, split on runs of
-- whitespace. Dividing by 200.0 (not 200) keeps the fraction, so 201 words is
-- two minutes rather than one.
alter table public.blog_posts
  add column reading_minutes_ro integer
    generated always as (
      case when content_ro is null then null else greatest(1, ceil(
        coalesce(array_length(regexp_split_to_array(
          btrim(regexp_replace(content_ro, '<[^>]*>', ' ', 'g')), '[[:space:]]+'), 1), 0) / 200.0
      ))::integer end
    ) stored,
  add column reading_minutes_en integer
    generated always as (
      case when content_en is null then null else greatest(1, ceil(
        coalesce(array_length(regexp_split_to_array(
          btrim(regexp_replace(content_en, '<[^>]*>', ' ', 'g')), '[[:space:]]+'), 1), 0) / 200.0
      ))::integer end
    ) stored;

-- The address of a post, /blog/<slug>: lowercase letters and digits in groups
-- joined by single hyphens. `not valid` checks every new and changed row but
-- leaves any old row alone until it is next saved, so this migration cannot
-- fail on a slug typed before the rule existed.
alter table public.blog_posts
  add constraint blog_posts_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') not valid;

alter table public.blog_posts drop column media_urls;

-- The public list reads published, visible posts newest first.
create index if not exists idx_blog_posts_published_at
  on public.blog_posts (published_at desc) where published and not hidden;

comment on column public.blog_posts.published_at is
  'When the post first went live. Set by blog_posts_stamp_published; the public pages sort and date by it.';
comment on column public.blog_posts.first_image is
  'Generated: the src of the first <img> in content_ro. The card and article use it when cover_url is empty.';
comment on column public.blog_posts.reading_minutes_ro is
  'Generated: words in content_ro at 200 a minute, at least 1; null without text.';
comment on column public.blog_posts.reading_minutes_en is
  'Generated: words in content_en at 200 a minute, at least 1; null without text (the page then uses the Romanian).';
comment on column public.blog_posts.author is
  'The byline. Null means the blog''s default author from site_content (blog.default_author).';

-- ---------------------------------------------------------------------------
-- 2. published_at is stamped the first time a post is published
-- ---------------------------------------------------------------------------
-- Only when it is empty: publishing, hiding and publishing again keeps the
-- original date, which is the date readers saw.
create or replace function public.stamp_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.published and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_published_at() from public;
revoke all on function public.stamp_published_at() from anon, authenticated, service_role;

comment on function public.stamp_published_at() is
  'Trigger function: sets published_at to now() the first time a row is saved as published.';

create trigger blog_posts_stamp_published
  before insert or update on public.blog_posts
  for each row execute function public.stamp_published_at();

-- ---------------------------------------------------------------------------
-- 3. Private changes to published content
-- ---------------------------------------------------------------------------
-- One row per post or event with unpublished changes: `data` holds the
-- changed fields under their column names. Exactly one of post_id and
-- event_id is set; the foreign keys delete the row with its post or event.
create table public.content_drafts (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid unique references public.blog_posts (id) on delete cascade,
  event_id   uuid unique references public.events (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_drafts_one_owner check (num_nonnulls(post_id, event_id) = 1)
);

alter table public.content_drafts enable row level security;

create policy "Admins manage drafts"
  on public.content_drafts for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Visitors get nothing, not even the table's existence in the API description.
-- The admin reaches it as `authenticated`, and the policy above then decides.
revoke all on public.content_drafts from anon, authenticated, service_role;
grant select, insert, update, delete on public.content_drafts to authenticated;
grant select, insert, update, delete on public.content_drafts to service_role;

create trigger content_drafts_set_updated_at
  before update on public.content_drafts
  for each row execute function public.set_updated_at();

comment on table public.content_drafts is
  'Unpublished changes to a live blog post or event, saved by the admin editor. Visitors see the published row until the admin publishes these. Admin only.';

-- ---------------------------------------------------------------------------
-- 4. Publishing a post's changes
-- ---------------------------------------------------------------------------
-- Copies each field present in the draft onto the post, then deletes the
-- draft, in one transaction: a failure leaves both as they were. A field
-- missing from the draft keeps the post's value; a field present as null
-- clears it (she emptied the subtitle).
--
-- security invoker: it runs with the caller's permissions, so the admin-only
-- policies on both tables apply. Anyone else updates and deletes nothing.
create or replace function public.publish_post_draft(p_post_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d jsonb;
begin
  select data into d from public.content_drafts where post_id = p_post_id;
  if d is null then
    return;
  end if;

  update public.blog_posts p set
    slug        = case when d ? 'slug'        then d->>'slug'        else p.slug end,
    title_ro    = case when d ? 'title_ro'    then coalesce(d->>'title_ro', '') else p.title_ro end,
    title_en    = case when d ? 'title_en'    then d->>'title_en'    else p.title_en end,
    subtitle_ro = case when d ? 'subtitle_ro' then d->>'subtitle_ro' else p.subtitle_ro end,
    subtitle_en = case when d ? 'subtitle_en' then d->>'subtitle_en' else p.subtitle_en end,
    content_ro  = case when d ? 'content_ro'  then d->>'content_ro'  else p.content_ro end,
    content_en  = case when d ? 'content_en'  then d->>'content_en'  else p.content_en end,
    cover_url   = case when d ? 'cover_url'   then d->>'cover_url'   else p.cover_url end,
    author      = case when d ? 'author'      then d->>'author'      else p.author end
  where p.id = p_post_id;

  delete from public.content_drafts where post_id = p_post_id;
end;
$$;

revoke all on function public.publish_post_draft(uuid) from public;
revoke all on function public.publish_post_draft(uuid) from anon, authenticated, service_role;
grant execute on function public.publish_post_draft(uuid) to authenticated;

comment on function public.publish_post_draft(uuid) is
  'Admin: applies a post''s content_drafts row to the post and deletes it, atomically. security invoker, so RLS limits it to the admin.';

-- ---------------------------------------------------------------------------
-- 5. The dashboard's draft count matches the Ciorne tab
-- ---------------------------------------------------------------------------
-- The post list sorts every post into exactly one tab: Publicate, Ciorne or
-- Ascunse. A hidden post is in Ascunse whether or not it was ever published,
-- so "drafts" here leaves hidden posts out too.
create or replace view public.admin_dashboard
with (security_invoker = true)
as
select
  (select count(*) from public.events e
    where e.published and e.ends_at > now())::int as active_events,
  (select coalesce(sum(o.pending_payments), 0)
     from public.admin_event_overview o)::int as pending_payments,
  (select count(*) from public.blog_posts p
    where not p.published and not p.hidden)::int as draft_posts,
  (select count(*) from public.contact_messages m
    where m.read_at is null and m.archived_at is null)::int as unread_messages,
  (select count(*) from public.testimonials t
    where not t.approved)::int as pending_testimonials;

-- ---------------------------------------------------------------------------
-- 6. The cookie policy's sentence about videos
-- ---------------------------------------------------------------------------
-- Videos now load only when pressed, and TikTok joins the list. replace()
-- changes the draft's sentence only where it is still word for word what
-- 20260925000000 wrote, so a policy she has already edited is left alone.
update public.site_content
set value_ro = replace(
      value_ro,
      'Unele pagini includ videoclipuri de pe YouTube, Vimeo sau Instagram. Aceste servicii pot seta propriile cookie-uri, după regulile lor.',
      'Unele pagini includ videoclipuri de pe YouTube, Vimeo, Instagram sau TikTok. Ele se încarcă doar când apeși pe ele; până atunci pagina nu contactează aceste servicii. După ce apeși, ele pot seta propriile cookie-uri, după regulile lor.'
    ),
    value_en = replace(
      value_en,
      'Some pages include videos from YouTube, Vimeo or Instagram. These services may set their own cookies, under their own rules.',
      'Some pages include videos from YouTube, Vimeo, Instagram or TikTok. They load only when you press play; until then the page does not contact these services. Once you do, they may set their own cookies, under their own rules.'
    )
where key = 'legal.cookies';
