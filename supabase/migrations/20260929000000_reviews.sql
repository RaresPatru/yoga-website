-- ===========================================================================
-- Verified reviews: testimonials written by the people who came
-- ===========================================================================
--
-- What this adds, and why:
--
--   testimonials
--     registration_id  The booking it was written from. A participant can
--                      only write through a personal link sent to the email
--                      they booked with, so this is what makes a testimonial
--                      verified. One testimonial per booking. Set to NULL if
--                      the booking is later deleted: the words stay.
--     photo_url        An optional photo, re-saved by the server as WebP with
--                      its hidden data (including location) removed.
--     consent_at       When they agreed to it being published. A participant's
--                      testimonial cannot be stored without it.
--     locale           The language of the page they wrote it on.
--     hidden           She took it off the site without deleting it.
--     on_home,         Her selection for the home page, in her order.
--     home_order
--     source           'participant' (written through a link) or 'imported'
--                      (anything that existed before, or that she adds by
--                      hand). Only 'participant' is shown as verified.
--
--   Visitors read only the columns a public page draws: never who wrote it
--   from which booking, or when they consented. And they see a testimonial
--   only once it is approved and not hidden.
--
--   review_invitations  One personal link per invitation. The link's token is
--                       stored only as a hash, so a copy of the database does
--                       not hand out working links. A link works once and
--                       lapses after 60 days; daily_cleanup() deletes lapsed
--                       ones. Only the server, with the service key, reads it.
--
--   admin_dashboard     "Testimoniale" counts the ones waiting for approval,
--                       which no longer includes the hidden ones.
--
--   The emails: review_too_early, and the invitation's text gains its expiry.
--   The privacy policy draft says what a testimonial collects and keeps.

-- ---------------------------------------------------------------------------
-- 1. What a testimonial records
-- ---------------------------------------------------------------------------
alter table public.testimonials
  add column registration_id uuid references public.registrations (id) on delete set null,
  add column photo_url       text,
  add column consent_at      timestamptz,
  add column locale          text,
  add column hidden          boolean not null default false,
  add column on_home         boolean not null default false,
  add column home_order      integer,
  add column source          text not null default 'imported';

alter table public.testimonials
  add constraint testimonials_source_known
    check (source in ('participant', 'imported')),
  add constraint testimonials_locale_known
    check (locale is null or locale in ('ro', 'en')),
  -- Published words need the writer's yes, so a participant's testimonial
  -- cannot exist without the moment they gave it.
  add constraint testimonials_participant_consented
    check (source <> 'participant' or consent_at is not null);

-- One testimonial per booking: a second link for the same booking is refused.
create unique index testimonials_one_per_booking
  on public.testimonials (registration_id)
  where registration_id is not null;

comment on column public.testimonials.registration_id is
  'The booking it was written from, through a personal link (verified). NULL for imported ones, or once the booking is deleted.';
comment on column public.testimonials.photo_url is
  'Optional photo, stored as WebP without its metadata (location included).';
comment on column public.testimonials.consent_at is
  'When the writer agreed to publication. Required for source = participant.';
comment on column public.testimonials.locale is
  'The language of the page it was written on: ro or en.';
comment on column public.testimonials.hidden is
  'Taken off the site by the admin without deleting it.';
comment on column public.testimonials.on_home is
  'Chosen by the admin for the home page.';
comment on column public.testimonials.home_order is
  'Its place among the home page selection, lowest first.';
comment on column public.testimonials.source is
  'participant: written through a personal link (verified). imported: anything else.';

-- ---------------------------------------------------------------------------
-- 2. What visitors may see
-- ---------------------------------------------------------------------------
-- The row policy decides which testimonials (approved, not hidden); the
-- column grant decides which of their columns. A query naming a column
-- outside the grant is refused outright, so public pages list their columns.
drop policy "Anyone can view approved testimonials" on public.testimonials;
create policy "Anyone can view approved testimonials"
  on public.testimonials for select
  using (approved and not hidden);

revoke all on public.testimonials from anon;
grant select (
  id, event_id, type, content, rating, author_name, video_url, photo_url,
  locale, source, on_home, home_order, event_title_ro, event_title_en,
  event_date, created_at
) on public.testimonials to anon;

-- ---------------------------------------------------------------------------
-- 3. The personal links
-- ---------------------------------------------------------------------------
create table public.review_invitations (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  -- SHA-256 of the token in the link, hex. The token itself is never stored.
  token_hash      text not null unique,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  used_at         timestamptz
);

create index review_invitations_registration on public.review_invitations (registration_id);

-- RLS on with no policy: nobody reaches a row through the API except the
-- service role, which bypasses it. The grants say the same thing in the other
-- half of Postgres's two checks.
alter table public.review_invitations enable row level security;
revoke all on public.review_invitations from anon, authenticated, service_role;
grant select, insert, update, delete on public.review_invitations to service_role;

comment on table public.review_invitations is
  'Personal links to write a testimonial, one per invitation email. Only token_hash is stored; a link works once (used_at) and lapses at expires_at. Service role only.';

-- ---------------------------------------------------------------------------
-- 4. The daily job deletes lapsed links
-- ---------------------------------------------------------------------------
-- The same function as 20260928000000_participants.sql, with one step added
-- at the end. Replaced in place: the signature is unchanged, so its grants
-- (service_role only) stay as they were.
create or replace function public.daily_cleanup()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_notes     integer := 0;
  v_abandoned integer := 0;
  v_links     integer := 0;
  v_rows      integer;
begin
  update public.registrations r
     set participant_note = null,
         admin_note       = null
    from public.events e
   where e.id = r.event_id
     and e.ends_at <= now() - interval '30 days'
     and (r.participant_note is not null or r.admin_note is not null);
  get diagnostics v_rows = row_count;
  v_notes := v_notes + v_rows;

  update public.waiting_list w
     set participant_note = null,
         admin_note       = null
    from public.events e
   where e.id = w.event_id
     and e.ends_at <= now() - interval '30 days'
     and (w.participant_note is not null or w.admin_note is not null);
  get diagnostics v_rows = row_count;
  v_notes := v_notes + v_rows;

  update public.waiting_list w
     set claimed_at              = null,
         claimed_registration_id = null,
         notified_at             = null,
         claim_expires_at        = null
    from public.registrations r
   where w.claimed_registration_id = r.id
     and r.payment_status = 'pending'
     and r.created_at < now() - interval '7 days';

  delete from public.registrations r
   where r.payment_status = 'pending'
     and r.created_at < now() - interval '7 days';
  get diagnostics v_abandoned = row_count;

  -- Links to write a testimonial, once they have lapsed, used or not.
  delete from public.review_invitations i
   where i.expires_at < now();
  get diagnostics v_links = row_count;

  return jsonb_build_object(
    'notes_cleared', v_notes,
    'abandoned_removed', v_abandoned,
    'review_links_expired', v_links
  );
end;
$$;

comment on function public.daily_cleanup() is
  'Run daily by /api/cron/daily: clears participant and admin notes 30 days after the event ends, deletes pending bookings older than 7 days (returning any waiting-list claim on them to the queue), and deletes lapsed testimonial links. service_role only.';

-- ---------------------------------------------------------------------------
-- 5. The dashboard counts what waits for approval
-- ---------------------------------------------------------------------------
create or replace view public.admin_dashboard
with (security_invoker = true)
as
select
  (select count(*) from public.admin_event_overview o
    where o.status in ('upcoming', 'ongoing', 'ended_pending'))::int as active_events,
  (select coalesce(sum(o.pending_payments), 0)
     from public.admin_event_overview o)::int as pending_payments,
  (select count(*) from public.blog_posts p
    where not p.published and not p.hidden)::int as draft_posts,
  (select count(*) from public.contact_messages m
    where m.read_at is null and m.archived_at is null)::int as unread_messages,
  (select count(*) from public.testimonials t
    where not t.approved and not t.hidden)::int as pending_testimonials;

-- ---------------------------------------------------------------------------
-- 6. The emails
-- ---------------------------------------------------------------------------
-- review_too_early answers someone who asks for a link before their event
-- has ended. testimonial_request, the invitation itself, gains the link's
-- expiry and a word on it working once, where its text is still the one the
-- baseline wrote.
alter table public.email_templates drop constraint email_templates_type_check;
alter table public.email_templates
  add constraint email_templates_type_check
    check (type in ('registration_confirmation', 'payment_confirmation',
                    'testimonial_request', 'spot_available',
                    'booking_cancelled', 'waitlist_removed',
                    'review_too_early'));

insert into public.email_templates (type, subject_ro, body_ro, subject_en, body_en) values
('review_too_early',
 'Testimonial - {{event_name}}',
 '<h2>Salut {{user_name}}!</h2><p>Mulțumim că vrei să scrii despre <strong>{{event_name}}</strong>. Poți scrie după ce se încheie evenimentul, pe {{event_end}}. Atunci cere din nou linkul, de pe aceeași pagină.</p>',
 'Testimonial - {{event_name}}',
 '<h2>Hi {{user_name}}!</h2><p>Thank you for wanting to write about <strong>{{event_name}}</strong>. You can write once the event has ended, on {{event_end}}. Ask for the link again then, on the same page.</p>')
on conflict (type) do nothing;

update public.email_templates
   set body_ro = '<h2>Salut {{user_name}}!</h2><p>Ne-ar face plăcere să aflăm părerea ta despre <strong>{{event_name}}</strong>.</p><p><a href="{{testimonial_link}}">Scrie un testimonial</a></p><p>Linkul este doar al tău, funcționează o singură dată și e valabil până pe {{expires_at}}.</p>'
 where type = 'testimonial_request'
   and body_ro = '<h2>Salut {{user_name}}!</h2><p>Ne-ar face plăcere să aflăm părerea ta despre <strong>{{event_name}}</strong>.</p><p>Lasă un testimonial aici: <a href="{{testimonial_link}}">{{testimonial_link}}</a></p>';

update public.email_templates
   set body_en = '<h2>Hi {{user_name}}!</h2><p>We would love to hear what you thought of <strong>{{event_name}}</strong>.</p><p><a href="{{testimonial_link}}">Write a testimonial</a></p><p>The link is yours alone, works once and is valid until {{expires_at}}.</p>'
 where type = 'testimonial_request'
   and body_en = '<h2>Hi {{user_name}}!</h2><p>We would love to hear your feedback about <strong>{{event_name}}</strong>.</p><p>Leave a testimonial here: <a href="{{testimonial_link}}">{{testimonial_link}}</a></p>';

-- ---------------------------------------------------------------------------
-- 7. The privacy policy says what a testimonial collects
-- ---------------------------------------------------------------------------
-- Like 20260928000000_participants.sql: each change finds a sentence the
-- draft wrote and adds after it, and leaves alone a policy she has reworded.
update public.site_content
   set value_ro = replace(
         value_ro,
         '<li><p><strong>Când ne scrii prin formularul de contact</strong>',
         '<li><p><strong>Dacă scrii un testimonial</strong>, prin linkul personal primit după eveniment: textul, nota dată, numele ales și, dacă le adaugi, o fotografie și un link video. Le publicăm doar cu acordul tău și după ce le citește organizatoarea. Din fotografie ștergem informațiile ascunse, cum ar fi locul unde a fost făcută. Poți cere oricând să fie șterse.</p></li>'
         || '<li><p><strong>Când ne scrii prin formularul de contact</strong>'
       )
 where key = 'legal.privacy'
   and position('Dacă scrii un testimonial' in value_ro) = 0;

update public.site_content
   set value_ro = replace(
         value_ro,
         '<li><p>Mesajele din formularul de contact:',
         '<li><p>Testimonialele: cât timp sunt publicate pe site, sau până ceri să fie șterse.</p></li>'
         || '<li><p>Mesajele din formularul de contact:'
       )
 where key = 'legal.privacy'
   and position('Testimonialele: cât timp' in value_ro) = 0;

update public.site_content
   set value_en = replace(
         value_en,
         '<li><p><strong>When you write to us through the contact form</strong>',
         '<li><p><strong>If you write a testimonial</strong>, through the personal link sent after the event: the text, the rating, the name you chose and, if you add them, a photo and a video link. We publish them only with your consent and after the organiser has read them. We remove the hidden information in the photo, such as where it was taken. You can ask for them to be deleted at any time.</p></li>'
         || '<li><p><strong>When you write to us through the contact form</strong>'
       )
 where key = 'legal.privacy'
   and position('If you write a testimonial' in value_en) = 0;

update public.site_content
   set value_en = replace(
         value_en,
         '<li><p>Contact form messages:',
         '<li><p>Testimonials: as long as they are published, or until you ask for them to be deleted.</p></li>'
         || '<li><p>Contact form messages:'
       )
 where key = 'legal.privacy'
   and position('Testimonials: as long as' in value_en) = 0;
