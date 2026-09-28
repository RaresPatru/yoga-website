-- ===========================================================================
-- Emails: a waiting-list confirmation, announcements, unsubscribing, and
-- offering freed seats in one locked step
-- ===========================================================================
--
-- What this adds, and why:
--
--   email_templates
--     waitlist_joined         Joining a full event's waiting list used to send
--                             nothing, so people could not tell whether it had
--                             worked. Now they get a confirmation.
--     the two confirmations   The WhatsApp line becomes a button, where its
--                             text is still the one the baseline wrote. A
--                             paragraph holding only a link is drawn as a
--                             button by the email layout (lib/email-layout.ts),
--                             and one whose link is empty is left out, so an
--                             event without a group no longer prints a blank.
--
--   announcements            Emails she writes herself, once in each
--                            language, to people chosen on the Registrations
--                            page. Only people who ticked "send me news" when
--                            they booked receive one.
--   announcement_recipients  Who each announcement went to, who was left out
--                            and why, and each person's unsubscribe link
--                            (stored as a hash, like the testimonial links).
--   admin_announcements      The history, with how many were sent, failed and
--                            left out.
--   email_suppressions       Everyone who unsubscribed. Announcements skip
--                            them unless they opt in again later.
--
--   admin_participants       Readable by the service role too: the server
--                            works out an announcement's recipients from it.
--
--   offer_waiting_list_seats(), settle_waiting_list_offers()
--                            Offering freed seats to the waiting list, done
--                            under a lock on the event row (audit B16). The
--                            count, the choice of who is next and the stamping
--                            used to be separate round trips, so two callers
--                            at once (a Stripe webhook and her save) could
--                            both offer the same seat. Offers whose email did
--                            not go are withdrawn, and only the ones that went
--                            are recorded (B9).
--
--   The privacy policy draft says how to unsubscribe and what is kept.

-- ---------------------------------------------------------------------------
-- 1. The waiting-list confirmation
-- ---------------------------------------------------------------------------
alter table public.email_templates drop constraint email_templates_type_check;
alter table public.email_templates
  add constraint email_templates_type_check
    check (type in ('registration_confirmation', 'payment_confirmation',
                    'testimonial_request', 'spot_available',
                    'booking_cancelled', 'waitlist_removed',
                    'review_too_early', 'waitlist_joined'));

insert into public.email_templates (type, subject_ro, body_ro, subject_en, body_en) values
('waitlist_joined',
 'Ești pe lista de așteptare - {{event_name}}',
 '<h2>Salut {{user_name}}!</h2><p>Ești pe lista de așteptare pentru <strong>{{event_name}}</strong> ({{event_date}}).</p><p>Dacă se eliberează un loc, îți scriem pe email, în ordinea în care v-ați înscris pe listă. Linkul din acel email e valabil 24 de ore.</p>',
 'You are on the waiting list - {{event_name}}',
 '<h2>Hi {{user_name}}!</h2><p>You are on the waiting list for <strong>{{event_name}}</strong> ({{event_date}}).</p><p>If a place frees up, we will email you, in the order people joined the list. The link in that email is valid for 24 hours.</p>')
on conflict (type) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The WhatsApp link as a button
-- ---------------------------------------------------------------------------
-- Each replace finds the sentence the baseline wrote; a template she has
-- reworded does not contain it and is left exactly as it is.
update public.email_templates
   set body_ro = replace(
         body_ro,
         '<p>Alătură-te grupului de WhatsApp: <a href="{{whatsapp_link}}">{{whatsapp_link}}</a></p>',
         '<p><a href="{{whatsapp_link}}">Intră în grupul de WhatsApp</a></p>'
       )
 where type in ('registration_confirmation', 'payment_confirmation');

update public.email_templates
   set body_en = replace(
         body_en,
         '<p>Join the WhatsApp group: <a href="{{whatsapp_link}}">{{whatsapp_link}}</a></p>',
         '<p><a href="{{whatsapp_link}}">Join the WhatsApp group</a></p>'
       )
 where type in ('registration_confirmation', 'payment_confirmation');

-- ---------------------------------------------------------------------------
-- 3. Announcements
-- ---------------------------------------------------------------------------
-- `audience` says who it is for, as she chose them:
--   {"kind": "all"}                           everyone who opted in
--   {"kind": "ids", "ids": [...]}             the rows she ticked on the
--                                             Registrations page
--   {"kind": "filter", "filters": {...}}      everyone matching a filter there
-- The people themselves are worked out when it is sent, so someone who
-- unsubscribes while it is a draft is not written to.
--
-- status: draft while she writes it, sending while the server sends it (with
-- send_started_at, so a send that died can be resumed but two cannot run at
-- once), sent once every recipient has been tried.
create table public.announcements (
  id              uuid primary key default gen_random_uuid(),
  subject_ro      text not null default '',
  subject_en      text,
  body_ro         text not null default '',
  body_en         text,
  audience        jsonb not null default '{"kind": "all"}'::jsonb,
  status          text not null default 'draft',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  send_started_at timestamptz,
  sent_at         timestamptz,
  constraint announcements_status_known
    check (status in ('draft', 'sending', 'sent')),
  constraint announcements_audience_known
    check (audience ? 'kind' and audience ->> 'kind' in ('all', 'ids', 'filter'))
);

alter table public.announcements enable row level security;

create policy "Admins manage announcements"
  on public.announcements for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.announcements from anon, authenticated, service_role;
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert, update, delete on public.announcements to service_role;

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

comment on table public.announcements is
  'Emails the admin writes herself (RO and EN) to people chosen on the Registrations page. audience is all, ids or filter; only people who opted in receive one. status draft, sending, sent. Admin only.';

-- One row per person an announcement was meant for, written by the server
-- when it is sent: `pending` until tried, then `sent` or `failed` (reason
-- holds the error); `excluded` for people left out, with the reason
-- (no_consent, unsubscribed). The unsubscribe link in each email carries a
-- random token; only its SHA-256 is stored.
create table public.announcement_recipients (
  announcement_id        uuid not null references public.announcements (id) on delete cascade,
  email                  text not null,
  full_name              text not null,
  locale                 text not null default 'ro',
  status                 text not null,
  reason                 text,
  unsubscribe_token_hash text unique,
  sent_at                timestamptz,
  primary key (announcement_id, email),
  constraint announcement_recipients_email_lowercase check (email = lower(email)),
  constraint announcement_recipients_locale_known check (locale in ('ro', 'en')),
  constraint announcement_recipients_status_known
    check (status in ('pending', 'sent', 'failed', 'excluded'))
);

-- She reads the list; only the server writes it.
alter table public.announcement_recipients enable row level security;

create policy "Admins read announcement recipients"
  on public.announcement_recipients for select to authenticated
  using (public.is_admin());

revoke all on public.announcement_recipients from anon, authenticated, service_role;
grant select on public.announcement_recipients to authenticated;
grant select, insert, update, delete on public.announcement_recipients to service_role;

comment on table public.announcement_recipients is
  'Who an announcement was sent to or left out (status pending, sent, failed, excluded; reason says why). unsubscribe_token_hash is the SHA-256 of the token in their unsubscribe link. Admin reads, server writes.';

-- The history: each announcement with its counts. security_invoker, so the
-- admin-only policies above decide who sees anything.
create view public.admin_announcements
with (security_invoker = true)
as
select
  a.*,
  count(r.email) filter (where r.status = 'sent')::int     as sent_count,
  count(r.email) filter (where r.status = 'failed')::int   as failed_count,
  count(r.email) filter (where r.status = 'pending')::int  as pending_count,
  count(r.email) filter (where r.status = 'excluded')::int as excluded_count
from public.announcements a
left join public.announcement_recipients r on r.announcement_id = a.id
group by a.id;

revoke all on public.admin_announcements from anon, authenticated, service_role;
grant select on public.admin_announcements to authenticated;

comment on view public.admin_announcements is
  'Admin: every announcement with how many recipients were sent, failed, still pending and left out. security_invoker.';

-- ---------------------------------------------------------------------------
-- 4. Everyone who unsubscribed
-- ---------------------------------------------------------------------------
-- One row per address. An announcement leaves out anyone here whose latest
-- opt-in is older than created_at; ticking "send me news" again on a later
-- booking is a new yes, and they are included again. Unsubscribing a second
-- time moves created_at forward.
--
-- reason: unsubscribed (their link), or admin (she stopped them herself, for
-- someone who asked another way).
create table public.email_suppressions (
  email           text primary key,
  reason          text not null default 'unsubscribed',
  announcement_id uuid references public.announcements (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint email_suppressions_email_lowercase check (email = lower(email)),
  constraint email_suppressions_reason_known check (reason in ('unsubscribed', 'admin'))
);

alter table public.email_suppressions enable row level security;

create policy "Admins manage email suppressions"
  on public.email_suppressions for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.email_suppressions from anon, authenticated, service_role;
grant select, insert, update, delete on public.email_suppressions to authenticated;
grant select, insert, update, delete on public.email_suppressions to service_role;

comment on table public.email_suppressions is
  'Addresses that unsubscribed from announcements (reason unsubscribed, or admin when she stopped them herself). Left out of an announcement unless they opted in again after created_at. Admin and server only.';

-- ---------------------------------------------------------------------------
-- 5. The server reads the participants list
-- ---------------------------------------------------------------------------
-- An announcement's recipients are worked out on the server, with the service
-- key, when it is sent: the rule about who opted in must hold where the email
-- leaves, not in the browser. The view stays unreadable to visitors.
grant select on public.admin_participants to service_role;

-- ---------------------------------------------------------------------------
-- 6. Offering freed seats, in one locked step (audit B16)
-- ---------------------------------------------------------------------------
-- The same rules lib/notify-waiting-list.ts applied, moved here so they run
-- under a lock on the event row, like register_for_event(): a booking and an
-- offer on the same event now wait for each other, and so do two offers.
--
--   - Nothing for an event that is unpublished, has started, or has a
--     capacity of NULL or 0 (sold out).
--   - Free seats are the capacity less the bookings that hold a seat
--     (holds_seat) and less the claim links still running: a live link is a
--     seat already promised.
--   - That many people are offered one, oldest entry first, skipping anyone
--     removed, anyone who already claimed, and anyone holding a live link.
--   - Each gets a claim window of p_hours, stamped on their row, which is
--     what makes their link work.
--
-- Returns the people stamped, for the server to email.
create function public.offer_waiting_list_seats(p_event_id uuid, p_hours integer default 24)
returns table (id uuid, full_name text, email text, locale text, claim_expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_capacity  integer;
  v_published boolean;
  v_starts_at timestamptz;
  v_taken     integer;
  v_promised  integer;
  v_free      integer;
begin
  if p_hours is null or p_hours < 1 or p_hours > 168 then
    raise exception 'p_hours must be between 1 and 168, got %', p_hours;
  end if;

  select e.max_participants, e.published, e.starts_at
    into v_capacity, v_published, v_starts_at
    from events e
   where e.id = p_event_id
     for update;

  if not found
     or v_published is not true
     or v_starts_at <= now()
     or v_capacity is null
     or v_capacity <= 0 then
    return;
  end if;

  select count(*)
    into v_taken
    from registrations r
   where r.event_id = p_event_id
     and public.holds_seat(r);

  select count(*)
    into v_promised
    from waiting_list w
   where w.event_id = p_event_id
     and w.claimed_at is null
     and w.removed_at is null
     and w.claim_expires_at > now();

  v_free := v_capacity - v_taken - v_promised;
  if v_free <= 0 then
    return;
  end if;

  return query
  with next_in_line as (
    select w.id
      from waiting_list w
     where w.event_id = p_event_id
       and w.claimed_at is null
       and w.removed_at is null
       and (w.claim_expires_at is null or w.claim_expires_at <= now())
     order by w.created_at, w.id
     limit v_free
  )
  update waiting_list w
     set notified_at      = now(),
         claim_expires_at = now() + make_interval(hours => p_hours)
    from next_in_line n
   where w.id = n.id
  returning w.id, w.full_name, w.email, w.locale, w.claim_expires_at;
end;
$$;

revoke all on function public.offer_waiting_list_seats(uuid, integer) from public;
revoke all on function public.offer_waiting_list_seats(uuid, integer) from anon, authenticated, service_role;
grant execute on function public.offer_waiting_list_seats(uuid, integer) to service_role;

comment on function public.offer_waiting_list_seats(uuid, integer) is
  'Offers an event''s free seats to its waiting list under a lock on the event row: counts seats held and links still running, stamps a claim window (p_hours) on the next people in line, returns them. The server emails them, then calls settle_waiting_list_offers. service_role only.';

-- After the emails: offers whose email did not go are withdrawn, so no seat
-- is held for someone who was never told, and those people are simply
-- waiting again, first in line. The ones that went are recorded as one batch
-- in waiting_list_notifications. Takes the same lock, so the batch number
-- cannot be taken twice.
create function public.settle_waiting_list_offers(p_event_id uuid, p_sent uuid[], p_unsent uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count   integer;
  v_expires timestamptz;
begin
  perform 1 from events e where e.id = p_event_id for update;

  update waiting_list w
     set notified_at      = null,
         claim_expires_at = null
   where w.event_id = p_event_id
     and w.id = any (coalesce(p_unsent, '{}'))
     and w.claimed_at is null;

  select count(*), max(w.claim_expires_at)
    into v_count, v_expires
    from waiting_list w
   where w.event_id = p_event_id
     and w.id = any (coalesce(p_sent, '{}'));

  if v_count > 0 then
    insert into waiting_list_notifications (event_id, batch_number, expires_at, spots_opened)
    select p_event_id, coalesce(max(n.batch_number), 0) + 1, v_expires, v_count
      from waiting_list_notifications n
     where n.event_id = p_event_id;
  end if;
end;
$$;

revoke all on function public.settle_waiting_list_offers(uuid, uuid[], uuid[]) from public;
revoke all on function public.settle_waiting_list_offers(uuid, uuid[], uuid[]) from anon, authenticated, service_role;
grant execute on function public.settle_waiting_list_offers(uuid, uuid[], uuid[]) to service_role;

comment on function public.settle_waiting_list_offers(uuid, uuid[], uuid[]) is
  'After offer_waiting_list_seats: withdraws the offers whose email failed (p_unsent) and records the ones sent (p_sent) as one batch in waiting_list_notifications. service_role only.';

-- ---------------------------------------------------------------------------
-- 7. The privacy policy says how to unsubscribe and what is kept
-- ---------------------------------------------------------------------------
-- As in the earlier migrations: each change finds a sentence the draft wrote
-- and adds to it, and leaves alone a policy she has reworded.
update public.site_content
   set value_ro = replace(
         value_ro,
         '<strong>Dacă bifezi că vrei să afli de evenimentele viitoare</strong>: adresa de email, ca să îți scriem despre ele. Temeiul este acordul tău, pe care îl poți retrage oricând.',
         '<strong>Dacă bifezi că vrei să afli de evenimentele viitoare</strong>: adresa de email, ca să îți scriem despre ele. Temeiul este acordul tău, pe care îl poți retrage oricând. Fiecare email de acest fel are un link de dezabonare; dacă îl folosești, păstrăm adresa ta doar pe o listă de excludere, ca să nu-ți mai scriem.'
       )
 where key = 'legal.privacy'
   and position('păstrăm adresa ta doar pe o listă de excludere' in value_ro) = 0;

update public.site_content
   set value_ro = replace(
         value_ro,
         '<li><p>Mesajele din formularul de contact:',
         '<li><p>Adresele celor care s-au dezabonat de la anunțuri: cât timp trimitem anunțuri, ca să nu le mai scriem.</p></li>'
         || '<li><p>Lista celor cărora le-am trimis un anunț: la fel ca înscrierile, 3 ani.</p></li>'
         || '<li><p>Mesajele din formularul de contact:'
       )
 where key = 'legal.privacy'
   and position('s-au dezabonat de la anunțuri' in value_ro) = 0;

update public.site_content
   set value_en = replace(
         value_en,
         '<strong>If you tick that you want to hear about future events</strong>: your email address, so we can write to you about them. The legal basis is your consent, which you can withdraw at any time.',
         '<strong>If you tick that you want to hear about future events</strong>: your email address, so we can write to you about them. The legal basis is your consent, which you can withdraw at any time. Every such email has an unsubscribe link; if you use it, we keep your address only on a suppression list, so we do not write to you again.'
       )
 where key = 'legal.privacy'
   and position('only on a suppression list' in value_en) = 0;

update public.site_content
   set value_en = replace(
         value_en,
         '<li><p>Contact form messages:',
         '<li><p>The addresses of people who unsubscribed from announcements: for as long as we send announcements, so we do not write to them again.</p></li>'
         || '<li><p>Who we sent an announcement to: like bookings, 3 years.</p></li>'
         || '<li><p>Contact form messages:'
       )
 where key = 'legal.privacy'
   and position('unsubscribed from announcements' in value_en) = 0;
