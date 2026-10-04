-- ===========================================================================
-- Payments: one booking per email, checkouts that can be resumed, refunds
-- through Stripe, cancelling from the confirmation email, and notices for
-- the admin
-- ===========================================================================
--
-- What this adds, and why:
--
--   registrations
--     checkout_started_at       When the booking's current checkout began. An
--                               unpaid booking holds its seat for
--                               pending_hold_interval() from then, so someone
--                               who comes back to pay gets a fresh hold
--                               instead of a second seat.
--     stripe_payment_intent_id  The payment itself, recorded when it succeeds.
--                               A refund is made against it, and a refund
--                               made in Stripe's Dashboard finds its booking
--                               by it.
--     amount_paid,              What Stripe actually charged, in the smallest
--     paid_currency,            unit (bani, cents), and the promotion code
--     discount_code             used, if any. With a code the amount is not
--                               the event's price.
--     cancelled_at              They cancelled through the link in their
--                               confirmation email.
--     refunded_at               When the money went back.
--     refund_failed_at          Stripe reported that a refund failed: the
--                               money is back in her Stripe balance and has
--                               to reach them another way.
--     cancel_token_hash         SHA-256 of the token in their cancel link.
--
--   holds_seat()                A cancelled booking frees its seat, and an
--                               unpaid one is held from checkout_started_at.
--
--   register_for_event()        One seat per email per event (audit B3). A
--                               second booking with an address that already
--                               holds a seat is refused; one whose checkout
--                               is still unpaid carries on with that booking
--                               rather than taking another seat.
--
--   admin_participants          The status `cancelled`, and the payment
--                               columns the participant panel shows.
--   admin_event_overview        Payments pending, through holds_seat().
--   admin_dashboard             Refunds waiting for her decision, and notices
--                               she has not seen.
--   daily_cleanup()             Abandoned checkouts measured from their last
--                               attempt; notices she saw 90 days ago go.
--
--   admin_notifications         What happened on the site without her: a
--                               participant cancelled, a refund was made in
--                               Stripe, a refund failed, a payment was
--                               returned because it had no seat behind it.
--
--   The two confirmation emails gain the cancel link, the paid one with the
--   moment until which a refund is automatic. The terms and the privacy
--   policy drafts say what the site now does: Revolut Pay beside cards, a
--   refund up to 48 hours before the start, cancelling from the email.

-- ---------------------------------------------------------------------------
-- 1. What a booking records about its payment
-- ---------------------------------------------------------------------------
alter table public.registrations
  add column checkout_started_at      timestamptz,
  add column stripe_payment_intent_id text,
  add column amount_paid              integer,
  add column paid_currency            text,
  add column discount_code            text,
  add column cancelled_at             timestamptz,
  add column refunded_at              timestamptz,
  add column refund_failed_at         timestamptz,
  add column cancel_token_hash        text;

alter table public.registrations
  add constraint registrations_amount_paid_not_negative
    check (amount_paid is null or amount_paid >= 0);

-- A payment belongs to one booking, and a link to one booking.
create unique index registrations_payment_intent
  on public.registrations (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create unique index registrations_cancel_token
  on public.registrations (cancel_token_hash)
  where cancel_token_hash is not null;

-- Read when a visitor comes back from Stripe and by the webhook.
create index registrations_checkout_session
  on public.registrations (stripe_session_id)
  where stripe_session_id is not null;

-- Finding someone's booking on an event: register_for_event() below.
create index registrations_event_email
  on public.registrations (event_id, lower(email));

-- Checkouts already under way keep the hold they had.
update public.registrations
   set checkout_started_at = created_at
 where payment_status = 'pending';

comment on column public.registrations.stripe_session_id is
  'The booking''s current Stripe Checkout session: set when one is created, so a visitor who comes back can resume it, and an expired session that is no longer current frees nothing.';
comment on column public.registrations.checkout_started_at is
  'When the current checkout began. An unpaid booking holds its seat for pending_hold_interval() from then. NULL on bookings that never paid online means created_at.';
comment on column public.registrations.stripe_payment_intent_id is
  'The Stripe payment, recorded when it succeeds. Refunds are made against it.';
comment on column public.registrations.amount_paid is
  'What Stripe charged, in the smallest unit of paid_currency (bani, cents). Differs from the event price when a promotion code was used.';
comment on column public.registrations.paid_currency is
  'The currency of amount_paid, as Stripe reports it (lowercase ISO code).';
comment on column public.registrations.discount_code is
  'The promotion code used at checkout, or NULL.';
comment on column public.registrations.cancelled_at is
  'When the participant cancelled through the link in their confirmation email. A cancelled booking holds no seat.';
comment on column public.registrations.refunded_at is
  'When the payment was refunded, by the site or in Stripe''s Dashboard.';
comment on column public.registrations.refund_failed_at is
  'When Stripe reported the refund failed. The money is back in the Stripe balance and has to be returned another way.';
comment on column public.registrations.cancel_token_hash is
  'SHA-256 of the token in the participant''s cancel link. The token itself is never stored.';

-- ---------------------------------------------------------------------------
-- 2. One definition of "holds a seat", with cancelling and resuming
-- ---------------------------------------------------------------------------
-- Replaced in place: the signature is the same, so its grants stay.
create or replace function public.holds_seat(r public.registrations)
returns boolean
language sql
stable
set search_path = ''
as $$
  select r.removed_at is null
     and r.cancelled_at is null
     and r.payment_status <> 'refunded'
     and (
       r.payment_status <> 'pending'
       or coalesce(r.checkout_started_at, r.created_at) > now() - public.pending_hold_interval()
     )
$$;

comment on function public.holds_seat(public.registrations) is
  'Whether a booking takes a seat: not removed, not cancelled, not refunded, and not an unpaid checkout whose last attempt began more than pending_hold_interval() ago. Shared by event_availability, register_for_event, admin_event_overview and admin_participants.';

-- ---------------------------------------------------------------------------
-- 3. The booking gate: one seat per email per event (audit B3)
-- ---------------------------------------------------------------------------
-- The rule is Rares' (3 October 2026): one seat per email address per event,
-- and nobody books for a friend; a friend books with their own address. The
-- check runs under the same lock on the event row as the seat count, so two
-- requests with one address cannot both get past it.
--
-- The booking that counts is the person's latest one that was not removed,
-- cancelled or refunded: any of those may book again.
--
--   - Paid or free: refused, code `already_registered`.
--   - An unpaid checkout: the same booking carries on, with the details just
--     sent and a fresh hold, and the answer says `resumed` and which Stripe
--     session it had, so the server can send them back to it. A checkout
--     whose hold has lapsed holds no seat, so it takes one again only if one
--     is free.
--   - If the event became free since, the unpaid booking becomes a free one;
--     the server then closes the old checkout.
--
-- Replaced in place: the signature is the one 20260928000000 created, so the
-- grants (service_role only) stay as they were.
create or replace function public.register_for_event(
  p_event_id          uuid,
  p_full_name         text,
  p_email             text,
  p_phone             text,
  p_payment_status    text default 'free',
  p_locale            text default 'ro',
  p_participant_note  text default null,
  p_marketing_opt_in  boolean default false,
  p_consented_at      timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max_participants integer;
  v_published        boolean;
  v_starts_at        timestamptz;
  v_taken            integer;
  v_registration_id  uuid;
  v_existing         registrations%rowtype;
  -- An empty note is no note, so it asks for no consent.
  v_note             text := nullif(btrim(p_participant_note), '');
  -- When they ticked the boxes: on this form (now), or on the waiting-list
  -- form, for a seat claimed later. Never in the future.
  v_consented_at     timestamptz := least(coalesce(p_consented_at, now()), now());
begin
  if p_payment_status not in ('free', 'pending', 'completed', 'refunded') then
    return jsonb_build_object('error', 'Invalid payment status.', 'code', 'invalid');
  end if;
  if p_locale not in ('ro', 'en') then
    return jsonb_build_object('error', 'Invalid language.', 'code', 'invalid');
  end if;

  select max_participants, published, starts_at
    into v_max_participants, v_published, v_starts_at
    from events
   where id = p_event_id
     for update;

  if not found then
    return jsonb_build_object('error', 'Evenimentul nu există.', 'code', 'not_found');
  end if;

  if v_published is not true then
    return jsonb_build_object('error', 'Evenimentul nu este disponibil.', 'code', 'unavailable');
  end if;

  if v_starts_at <= now() then
    return jsonb_build_object('error', 'Înscrierile s-au închis: evenimentul a început.', 'code', 'started');
  end if;

  select *
    into v_existing
    from registrations r
   where r.event_id = p_event_id
     and lower(r.email) = lower(p_email)
     and r.removed_at is null
     and r.cancelled_at is null
     and r.payment_status <> 'refunded'
   order by r.created_at desc
   limit 1;

  if found then
    if v_existing.payment_status <> 'pending' then
      return jsonb_build_object('error', 'Ai deja un loc la acest eveniment.', 'code', 'already_registered');
    end if;

    if not public.holds_seat(v_existing) then
      select count(*)
        into v_taken
        from registrations r
       where r.event_id = p_event_id
         and public.holds_seat(r);

      if v_max_participants is null or v_taken >= v_max_participants then
        return jsonb_build_object('error', 'Evenimentul este complet.', 'code', 'full');
      end if;
    end if;

    update registrations
       set full_name            = p_full_name,
           phone                = p_phone,
           locale               = p_locale,
           payment_status       = p_payment_status,
           participant_note     = v_note,
           note_consent_at      = case when v_note is not null then v_consented_at end,
           marketing_consent_at = case when p_marketing_opt_in then v_consented_at end,
           checkout_started_at  = case when p_payment_status = 'pending' then now() end
     where id = v_existing.id;

    return jsonb_build_object(
      'success', true,
      'id', v_existing.id,
      'resumed', true,
      'session_id', v_existing.stripe_session_id
    );
  end if;

  select count(*)
    into v_taken
    from registrations r
   where r.event_id = p_event_id
     and public.holds_seat(r);

  if v_max_participants is null or v_taken >= v_max_participants then
    return jsonb_build_object('error', 'Evenimentul este complet.', 'code', 'full');
  end if;

  insert into registrations (
    event_id, full_name, email, phone, payment_status,
    locale, participant_note, note_consent_at, marketing_consent_at,
    checkout_started_at
  )
  values (
    p_event_id, p_full_name, p_email, p_phone, p_payment_status,
    p_locale, v_note,
    case when v_note is not null then v_consented_at end,
    case when p_marketing_opt_in then v_consented_at end,
    case when p_payment_status = 'pending' then now() end
  )
  returning id into v_registration_id;

  return jsonb_build_object('success', true, 'id', v_registration_id);
end;
$$;

comment on function public.register_for_event(uuid, text, text, text, text, text, text, boolean, timestamptz) is
  'The only way a booking is created. Locks the event row, refuses drafts, events that have started, full events (holds_seat) and an address that already holds a seat (already_registered); an unpaid checkout with the same address is resumed instead (resumed, session_id). Refusals carry a code. service_role only.';

-- ---------------------------------------------------------------------------
-- 4. Everyone on one list, with cancellations and payments
-- ---------------------------------------------------------------------------
-- Dropped and created rather than replaced: new columns join the middle of
-- the row, which `create or replace view` refuses. Nothing depends on this
-- view, and the grants are stated again below.
--
-- status, first match wins (as before, with `cancelled`):
--   removed           she took them off
--   refunded          the money went back
--   refund_requested  a refund waits for her: asked through the cancel link
--                     less than 48 hours before the start, or marked by her
--   cancelled         they cancelled through their link (a free booking, or
--                     a paid one whose refund she declined)
--   pending           a checkout still holding its seat
--   abandoned         a checkout past its hold, never paid
--   paid, free        a booking that holds its seat
--   offers, waitlist  as before
--
-- archived: removed, or cancelled with no refund waiting on her, or the
-- event has ended with nothing pending.
drop view public.admin_participants;

create view public.admin_participants
with (security_invoker = true)
as
with people as (
  select
    'booking'::text                  as kind,
    r.id,
    r.event_id,
    r.full_name,
    r.email,
    r.phone,
    r.locale,
    r.created_at,
    r.participant_note,
    r.note_consent_at,
    r.marketing_consent_at,
    r.admin_note,
    r.payment_status,
    r.refund_requested_at,
    r.removed_at,
    r.removal_reason,
    null::timestamptz                as offer_expires_at,
    case
      when r.removed_at is not null then 'removed'
      when r.payment_status = 'refunded' then 'refunded'
      when r.refund_requested_at is not null then 'refund_requested'
      when r.cancelled_at is not null then 'cancelled'
      when r.payment_status = 'pending' and public.holds_seat(r) then 'pending'
      when r.payment_status = 'pending' then 'abandoned'
      when r.payment_status = 'completed' then 'paid'
      else 'free'
    end                              as status,
    r.cancelled_at,
    r.refunded_at,
    r.refund_failed_at,
    r.amount_paid,
    r.paid_currency,
    r.discount_code,
    (r.stripe_payment_intent_id is not null or r.stripe_session_id is not null)
                                     as paid_online
  from public.registrations r

  union all

  select
    'waitlist'::text,
    w.id,
    w.event_id,
    w.full_name,
    w.email,
    w.phone,
    w.locale,
    w.created_at,
    w.participant_note,
    w.note_consent_at,
    w.marketing_consent_at,
    w.admin_note,
    null::text,
    null::timestamptz,
    w.removed_at,
    w.removal_reason,
    case when w.claim_expires_at > now() then w.claim_expires_at end,
    case
      when w.removed_at is not null then 'removed'
      when w.claim_expires_at > now() then 'offers'
      else 'waitlist'
    end,
    null::timestamptz,
    null::timestamptz,
    null::timestamptz,
    null::integer,
    null::text,
    null::text,
    false
  from public.waiting_list w
  where w.claimed_at is null
)
select
  p.*,
  lower(p.email)  as email_key,
  e.title_ro      as event_title,
  e.date          as event_date,
  e.starts_at     as event_starts_at,
  e.ends_at       as event_ends_at,
  e.price         as event_price,
  e.currency      as event_currency,
  case
    when p.status in ('removed', 'cancelled') then true
    when p.kind = 'waitlist' then e.ends_at <= now()
    else e.ends_at <= now() and p.status not in ('pending', 'refund_requested')
  end             as archived,
  translate(
    lower(concat_ws(' ', p.full_name, p.email, e.title_ro, e.title_en)),
    'ăâîșşțţáàäåãéèëêíìïóòöôõőúùüûűýçñ',
    'aaissttaaaaaeeeeiiioooooouuuuuycn'
  ) || ' ' || regexp_replace(p.phone, '\D', '', 'g')
                  as search_text
from people p
join public.events e on e.id = p.event_id;

-- Stated in full: a new view picks up different default privileges locally
-- and in production (CLAUDE.md). The server reads it to work out an
-- announcement's recipients (20260930000000_email_system.sql).
revoke all on public.admin_participants from anon, authenticated, service_role;
grant select on public.admin_participants to authenticated;
grant select on public.admin_participants to service_role;

comment on view public.admin_participants is
  'Admin: every booking and every unclaimed waiting-list entry, with its event, a status (removed, refunded, refund_requested, cancelled, pending, abandoned, paid, free, offers, waitlist), what was paid, archived, and search_text. security_invoker, admin-only through the underlying policies; the service role reads it for announcements.';

-- ---------------------------------------------------------------------------
-- 5. Payments pending, through the one definition
-- ---------------------------------------------------------------------------
-- The same columns in the same order, so the view is replaced in place.
-- pending_payments counted unpaid checkouts younger than an hour from
-- created_at; holds_seat() now decides, from the last attempt.
create or replace view public.admin_event_overview
with (security_invoker = true)
as
select
  e.id as event_id,
  c.waiting,
  c.pending_payments,
  c.refund_requested,
  c.offers_open,
  c.refunded,
  c.taken,
  e.max_participants as capacity,
  case
    when not e.published then 'draft'
    when now() < e.starts_at then 'upcoming'
    when now() < e.ends_at then 'ongoing'
    when c.pending_payments > 0 or c.refund_requested > 0 then 'ended_pending'
    else 'archived'
  end as status
from public.events e
cross join lateral (
  select
    (select count(*) from public.waiting_list w
      where w.event_id = e.id
        and w.claimed_at is null
        and w.removed_at is null
        and (w.claim_expires_at is null or w.claim_expires_at <= now()))::int as waiting,
    (select count(*) from public.registrations r
      where r.event_id = e.id
        and r.payment_status = 'pending'
        and public.holds_seat(r))::int as pending_payments,
    (select count(*) from public.registrations r
      where r.event_id = e.id
        and r.removed_at is null
        and r.refund_requested_at is not null
        and r.payment_status <> 'refunded')::int as refund_requested,
    (select count(*) from public.waiting_list w
      where w.event_id = e.id
        and w.claimed_at is null
        and w.removed_at is null
        and w.claim_expires_at > now())::int as offers_open,
    (select count(*) from public.registrations r
      where r.event_id = e.id
        and r.payment_status = 'refunded')::int as refunded,
    (select count(*) from public.registrations r
      where r.event_id = e.id
        and public.holds_seat(r))::int as taken
) c;

-- ---------------------------------------------------------------------------
-- 6. What happened without her
-- ---------------------------------------------------------------------------
-- Rares asked (3 October 2026) that she be told on the dashboard whenever a
-- refund is made or a place opens up. Her own actions in the panel are not
-- recorded here: she knows about those. One row per thing that happened:
--
--   cancelled         a participant cancelled through their link. details:
--                     refund (automatic, requested or none), amount, currency.
--   refunded          a refund was made outside the site, in Stripe's
--                     Dashboard. details: amount, currency.
--   refund_failed     Stripe could not return a refund. details: amount,
--                     currency.
--   payment_returned  the site refunded a payment it had no seat for: a
--                     second payment for one booking, or a payment for a
--                     booking that was removed or cancelled meanwhile.
--                     details: amount, currency, reason, and the payer's
--                     name and email when no booking is left to show them.
--
-- source_id names what the notice is about (a cancellation, a Stripe charge,
-- refund or checkout), so something reported twice, by the webhook and by
-- the page the visitor returns to, is recorded once.
--
-- seen_at is set when she marks them seen; daily_cleanup() deletes them 90
-- days after that.
create table public.admin_notifications (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,
  registration_id uuid references public.registrations (id) on delete cascade,
  event_id        uuid references public.events (id) on delete cascade,
  details         jsonb not null default '{}'::jsonb,
  source_id       text unique,
  created_at      timestamptz not null default now(),
  seen_at         timestamptz,
  constraint admin_notifications_kind_known
    check (kind in ('cancelled', 'refunded', 'refund_failed', 'payment_returned'))
);

create index admin_notifications_unseen
  on public.admin_notifications (created_at desc)
  where seen_at is null;

create index admin_notifications_registration
  on public.admin_notifications (registration_id);

alter table public.admin_notifications enable row level security;

create policy "Admins read notices"
  on public.admin_notifications for select to authenticated
  using (public.is_admin());

create policy "Admins mark notices seen"
  on public.admin_notifications for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- She reads them and marks them seen, nothing more: only the server writes
-- them, and only `seen_at` is hers to change.
revoke all on public.admin_notifications from anon, authenticated, service_role;
grant select on public.admin_notifications to authenticated;
grant update (seen_at) on public.admin_notifications to authenticated;
grant select, insert, update, delete on public.admin_notifications to service_role;

comment on table public.admin_notifications is
  'Notices for the admin dashboard about what happened without her: cancelled (through a participant''s link), refunded (in Stripe''s Dashboard), refund_failed, payment_returned (a payment with no seat behind it, refunded automatically). The admin reads them and sets seen_at; only the server inserts.';

-- ---------------------------------------------------------------------------
-- 7. The dashboard counts refunds to decide and notices not yet seen
-- ---------------------------------------------------------------------------
-- The five columns it had, in the same order, then the two new ones, so it
-- is replaced in place.
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
    where not t.approved and not t.hidden)::int as pending_testimonials,
  (select count(*) from public.registrations r
    where r.removed_at is null
      and r.refund_requested_at is not null
      and r.payment_status <> 'refunded')::int as refund_requests,
  (select count(*) from public.admin_notifications n
    where n.seen_at is null)::int as unseen_notices;

-- ---------------------------------------------------------------------------
-- 8. The daily job
-- ---------------------------------------------------------------------------
-- As 20260929000000_reviews.sql wrote it, with two changes: an abandoned
-- checkout is dated from its last attempt rather than from the booking, so
-- one resumed yesterday is not deleted as a week old, and notices she saw
-- 90 days ago are deleted. Replaced in place, so the grants stay.
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
  v_notices   integer := 0;
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
     and coalesce(r.checkout_started_at, r.created_at) < now() - interval '7 days';

  delete from public.registrations r
   where r.payment_status = 'pending'
     and coalesce(r.checkout_started_at, r.created_at) < now() - interval '7 days';
  get diagnostics v_abandoned = row_count;

  -- Links to write a testimonial, once they have lapsed, used or not.
  delete from public.review_invitations i
   where i.expires_at < now();
  get diagnostics v_links = row_count;

  delete from public.admin_notifications n
   where n.seen_at < now() - interval '90 days';
  get diagnostics v_notices = row_count;

  return jsonb_build_object(
    'notes_cleared', v_notes,
    'abandoned_removed', v_abandoned,
    'review_links_expired', v_links,
    'notices_removed', v_notices
  );
end;
$$;

comment on function public.daily_cleanup() is
  'Run daily by /api/cron/daily: clears participant and admin notes 30 days after the event ends, deletes unpaid bookings whose last checkout began over 7 days ago (returning any waiting-list claim on them to the queue), deletes lapsed testimonial links, and deletes notices seen over 90 days ago. service_role only.';

-- ---------------------------------------------------------------------------
-- 9. The cancel link in both confirmations
-- ---------------------------------------------------------------------------
-- Added to the end of each confirmation, in both languages, unless it is
-- already there: the link is how cancelling works, so it goes in even where
-- she has reworded the rest, which stays exactly as she wrote it.
--
-- The paid one also says until when a refund is automatic. That line is a
-- label with its value, so the email leaves it out when there is no value:
-- for a booking made less than 48 hours before the start
-- (lib/email-content.ts, tidyLine).
update public.email_templates
   set body_ro = body_ro || '<p>Dacă nu mai poți veni, <a href="{{cancel_link}}">anulează-ți înscrierea</a>, ca locul să ajungă la altcineva.</p>'
 where type = 'registration_confirmation'
   and position('{{cancel_link}}' in body_ro) = 0;

update public.email_templates
   set body_en = body_en || '<p>If you can no longer come, <a href="{{cancel_link}}">cancel your booking</a> so your place can go to someone else.</p>'
 where type = 'registration_confirmation'
   and body_en is not null
   and position('{{cancel_link}}' in body_en) = 0;

update public.email_templates
   set body_ro = body_ro || '<p>Dacă nu mai poți veni, <a href="{{cancel_link}}">anulează-ți înscrierea</a>.<br><strong>Banii se returnează automat dacă anulezi până la:</strong> {{refund_until}}</p>'
 where type = 'payment_confirmation'
   and position('{{cancel_link}}' in body_ro) = 0;

update public.email_templates
   set body_en = body_en || '<p>If you can no longer come, <a href="{{cancel_link}}">cancel your booking</a>.<br><strong>Your payment is refunded automatically if you cancel by:</strong> {{refund_until}}</p>'
 where type = 'payment_confirmation'
   and body_en is not null
   and position('{{cancel_link}}' in body_en) = 0;

-- ---------------------------------------------------------------------------
-- 10. The terms say what the site does
-- ---------------------------------------------------------------------------
-- As in the earlier migrations: each change finds the sentences the
-- 25 September draft wrote and leaves alone a text she has reworded. The
-- cancellation rules are Rares' of 3 October 2026, provisional until she
-- confirms them: a full refund, automatically, up to 48 hours before the
-- start; after that the seat is freed and the refund is her decision. Refunds
-- are never partial.
update public.site_content
   set value_ro = replace(
         value_ro,
         'Plata se face cu cardul, prin Stripe.',
         'Plata se face cu cardul sau cu Revolut Pay, prin Stripe.'
       )
 where key = 'legal.terms';

update public.site_content
   set value_en = replace(
         value_en,
         'Payment is by card, through Stripe.',
         'Payment is by card or with Revolut Pay, through Stripe.'
       )
 where key = 'legal.terms';

update public.site_content
   set value_ro = replace(
         value_ro,
         '<ul>
<li><p>Dacă anulezi cu cel puțin 7 zile înainte de eveniment, primești banii înapoi integral.</p></li>
<li><p>Dacă anulezi mai târziu, banii nu se mai rambursează, dar poți ceda locul altei persoane, anunțând-o pe organizatoare.</p></li>
<li><p>Dacă evenimentul este anulat de organizatoare, primești banii înapoi integral.</p></li>
</ul>
<p>Pentru o anulare, scrie la {{email}}. ',
         '<ul>
<li><p>Poți anula o înscriere până la începerea evenimentului, din linkul aflat în emailul de confirmare sau scriindu-ne la {{email}}.</p></li>
<li><p>Dacă anulezi cu cel puțin 48 de ore înainte de începerea evenimentului, primești automat banii înapoi integral, pe cardul sau în contul Revolut cu care ai plătit.</p></li>
<li><p>Dacă anulezi mai târziu, locul tău se eliberează, iar organizatoarea decide dacă îți returnează banii. Dacă vrei, îi poți ceda locul altei persoane: scrie-i organizatoarei în loc să anulezi.</p></li>
<li><p>Când banii se returnează, se returnează integral.</p></li>
<li><p>Dacă evenimentul este anulat de organizatoare, primești banii înapoi integral.</p></li>
</ul>
<p>'
       )
 where key = 'legal.terms';

update public.site_content
   set value_en = replace(
         value_en,
         '<ul>
<li><p>If you cancel at least 7 days before the event, you get a full refund.</p></li>
<li><p>If you cancel later, the price is not refunded, but you can give your place to someone else by letting the organiser know.</p></li>
<li><p>If the organiser cancels the event, you get a full refund.</p></li>
</ul>
<p>To cancel, write to {{email}}. ',
         '<ul>
<li><p>You can cancel a booking until the event starts, through the link in your confirmation email or by writing to us at {{email}}.</p></li>
<li><p>If you cancel at least 48 hours before the event starts, you get a full refund automatically, to the card or Revolut account you paid with.</p></li>
<li><p>If you cancel later, your place is freed and the organiser decides whether to refund you. If you like, you can give your place to someone else instead: write to the organiser rather than cancelling.</p></li>
<li><p>When a payment is refunded, it is refunded in full.</p></li>
<li><p>If the organiser cancels the event, you get a full refund.</p></li>
</ul>
<p>'
       )
 where key = 'legal.terms';

-- ---------------------------------------------------------------------------
-- 11. The privacy policy says what a payment leaves behind
-- ---------------------------------------------------------------------------
update public.site_content
   set value_ro = replace(
         value_ro,
         '<li><p><strong>Când plătești</strong>: plata se face prin Stripe. Datele cardului le introduci direct la Stripe; noi nu le vedem și nu le păstrăm. Primim doar confirmarea că plata s-a făcut.</p></li>',
         '<li><p><strong>Când plătești</strong>: plata se face prin Stripe, cu cardul sau cu Revolut Pay. Datele cardului le introduci direct la Stripe, iar o plată cu Revolut Pay o confirmi în aplicația Revolut; noi nu vedem și nu păstrăm datele cardului sau ale contului tău. Primim confirmarea că plata s-a făcut, suma plătită și codul de reducere, dacă ai folosit unul.</p></li>'
       )
 where key = 'legal.privacy';

update public.site_content
   set value_en = replace(
         value_en,
         '<li><p><strong>When you pay</strong>: payment goes through Stripe. You enter your card details with Stripe directly; we never see or keep them. We only receive confirmation that the payment went through.</p></li>',
         '<li><p><strong>When you pay</strong>: payment goes through Stripe, by card or with Revolut Pay. You enter your card details with Stripe directly, and you confirm a Revolut Pay payment in the Revolut app; we never see or keep your card or account details. We receive confirmation that the payment went through, the amount paid and the discount code, if you used one.</p></li>'
       )
 where key = 'legal.privacy';
