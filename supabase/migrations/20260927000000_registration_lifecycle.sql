-- ===========================================================================
-- The life of a booking: what it records, when it holds a seat, when booking
-- closes, and what the admin sees for each event
-- ===========================================================================
--
-- What this adds, and why:
--
--   registrations
--     locale                The page's language when they booked, so emails
--                           can answer in it (phase 5 sends them).
--     participant_note      "Ceva ce ar trebui să știu?": optional, and often
--     note_consent_at       about health, which GDPR treats as special. A note
--                           is only stored together with the moment they
--                           consented to it being kept (a CHECK makes it so).
--     admin_note            Her own note about the person.
--     marketing_consent_at  When they ticked "send me news", or NULL.
--     refund_requested_at   Marked by her until the Stripe phase makes it
--                           self-service.
--     removed_at,           She took the person off the event. The row stays
--     removal_reason        for her records; it no longer holds a seat.
--
--   waiting_list
--     locale, removed_at, removal_reason   As above.
--
--   holds_seat()            ONE definition of "this booking takes a seat",
--                           used by the public seat count and by the booking
--                           function, which must agree exactly or the page and
--                           the booking contradict each other.
--
--   register_for_event()    Rebuilt: it refuses once the event has started
--                           (audit B4), answers with a machine-readable `code`
--                           beside its sentence, and stores the new fields.
--
--   admin_event_overview    Per event: its status (draft, upcoming, ongoing,
--                           ended with something pending, archived), seats
--                           taken, and the five numbers the admin list shows.
--
--   admin_dashboard         "Evenimente" counts what the admin list's
--                           Upcoming tab holds.
--
--   publish_event_draft()   The events counterpart of publish_post_draft():
--                           a live event's private changes, published in one
--                           transaction, with the date, price and places left
--                           alone once the event has ended.

-- ---------------------------------------------------------------------------
-- 1. What a booking records
-- ---------------------------------------------------------------------------
alter table public.registrations
  add column locale               text not null default 'ro',
  add column participant_note     text,
  add column note_consent_at      timestamptz,
  add column admin_note           text,
  add column marketing_consent_at timestamptz,
  add column refund_requested_at  timestamptz,
  add column removed_at           timestamptz,
  add column removal_reason       text;

alter table public.registrations
  add constraint registrations_locale_known
    check (locale in ('ro', 'en')),
  -- A note about someone's health may only be kept with their consent, so
  -- the database refuses one without the moment they gave it.
  add constraint registrations_note_needs_consent
    check (participant_note is null or note_consent_at is not null);

alter table public.waiting_list
  add column locale         text not null default 'ro',
  add column removed_at     timestamptz,
  add column removal_reason text;

alter table public.waiting_list
  add constraint waiting_list_locale_known
    check (locale in ('ro', 'en'));

comment on column public.registrations.locale is
  'The language of the page they booked on: ro or en. Emails answer in it.';
comment on column public.registrations.participant_note is
  'Optional note from the participant, often about health. Only stored with note_consent_at (registrations_note_needs_consent). Cleared 30 days after the event.';
comment on column public.registrations.note_consent_at is
  'When the participant consented to their note being kept.';
comment on column public.registrations.admin_note is
  'The admin''s own note about this participant. Never shown to them.';
comment on column public.registrations.marketing_consent_at is
  'When they opted in to promotional email, or NULL for no.';
comment on column public.registrations.refund_requested_at is
  'When a refund was requested, marked by the admin until refunds are self-service. payment_status becomes refunded once it is done.';
comment on column public.registrations.removed_at is
  'When the admin removed this person from the event. A removed row keeps its history and holds no seat.';
comment on column public.waiting_list.locale is
  'The language of the page they joined the waiting list on: ro or en.';
comment on column public.waiting_list.removed_at is
  'When the admin took this person off the waiting list. A removed entry is never offered a seat.';

-- ---------------------------------------------------------------------------
-- 2. One definition of "holds a seat"
-- ---------------------------------------------------------------------------
-- A booking takes a seat unless she removed it, it was refunded, or it is a
-- checkout nobody finished within pending_hold_interval() (an hour).
--
-- It takes the whole row, which lets SQL say `where public.holds_seat(r)` and
-- lets the admin panel ask PostgREST for `holds_seat` as if it were a column.
-- It reads nothing but the row it is given.
create function public.holds_seat(r public.registrations)
returns boolean
language sql
stable
set search_path = ''
as $$
  select r.removed_at is null
     and r.payment_status <> 'refunded'
     and (
       r.payment_status <> 'pending'
       or r.created_at > now() - public.pending_hold_interval()
     )
$$;

-- anon needs EXECUTE because event_availability calls this, and Postgres
-- checks a view's functions against the caller: the same reason
-- pending_hold_interval() is granted to anon. It computes from its argument
-- and reads no table, so calling it directly reveals nothing.
revoke all on function public.holds_seat(public.registrations) from public;
revoke all on function public.holds_seat(public.registrations) from anon, authenticated, service_role;
grant execute on function public.holds_seat(public.registrations) to anon, authenticated, service_role;

comment on function public.holds_seat(public.registrations) is
  'Whether a booking takes a seat: not removed, not refunded, and not an unpaid checkout older than pending_hold_interval(). Shared by event_availability, register_for_event and admin_event_overview.';

-- ---------------------------------------------------------------------------
-- 3. The public seat count, through that definition
-- ---------------------------------------------------------------------------
-- Same columns as before, so every page reading it is unchanged. Still not
-- security_invoker, for the reason in the baseline: it counts rows the
-- visitor may not read, and returns only numbers.
create or replace view public.event_availability as
select
  e.id               as event_id,
  e.max_participants as capacity,
  count(r.id) filter (where public.holds_seat(r)) as taken
from public.events e
left join public.registrations r on r.event_id = e.id
where e.published = true
group by e.id, e.max_participants;

-- ---------------------------------------------------------------------------
-- 4. The booking gate
-- ---------------------------------------------------------------------------
-- Dropped and created rather than replaced, because the argument list grows
-- and a replace would leave the old signature behind as a second function.
-- The grants below are therefore not a restatement: without the revoke from
-- PUBLIC, the new function would be callable by anyone with the publishable
-- key, which once made booking a paid retreat without paying one request.
--
-- What it keeps from before: the FOR UPDATE lock on the event row, which
-- closes the race for the last seat; the published check; NULL or 0 capacity
-- refusing everyone (20260918000000_capacity_is_required.sql).
--
-- What is new:
--   - It refuses once the event has started. `starts_at` is midnight on the
--     day for an event with no announced hour, so such an event closes when
--     its day begins. An Instagram story lives forever, and before this an
--     old one opened a past event with a working payment button (audit B4).
--   - Seats are counted with holds_seat(), so a removed booking frees its
--     seat here and on the page at the same moment.
--   - Every refusal carries a `code` (not_found, unavailable, started, full,
--     invalid) beside the Romanian sentence, so the API can answer in the
--     visitor's language without parsing Romanian.
--   - It stores the language, the note with its consent time, and the
--     marketing opt-in.
drop function public.register_for_event(uuid, text, text, text, text);

create function public.register_for_event(
  p_event_id          uuid,
  p_full_name         text,
  p_email             text,
  p_phone             text,
  p_payment_status    text default 'free',
  p_locale            text default 'ro',
  p_participant_note  text default null,
  p_marketing_opt_in  boolean default false
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
  -- An empty note is no note, so it asks for no consent.
  v_note             text := nullif(btrim(p_participant_note), '');
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

  -- Draft events are not bookable. The API checks this too, but a rule this
  -- important belongs next to the data as well.
  if v_published is not true then
    return jsonb_build_object('error', 'Evenimentul nu este disponibil.', 'code', 'unavailable');
  end if;

  if v_starts_at <= now() then
    return jsonb_build_object('error', 'Înscrierile s-au închis: evenimentul a început.', 'code', 'started');
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
    locale, participant_note, note_consent_at, marketing_consent_at
  )
  values (
    p_event_id, p_full_name, p_email, p_phone, p_payment_status,
    p_locale, v_note,
    case when v_note is not null then now() end,
    case when p_marketing_opt_in then now() end
  )
  returning id into v_registration_id;

  return jsonb_build_object('success', true, 'id', v_registration_id);
end;
$$;

-- `from public` is the line that does the work: Postgres grants EXECUTE to
-- PUBLIC when a function is created, and anon and authenticated inherit it.
-- tests/rpc-exposure.spec.ts calls this with the publishable key and expects
-- a refusal.
revoke all on function public.register_for_event(uuid, text, text, text, text, text, text, boolean)
  from public;
revoke all on function public.register_for_event(uuid, text, text, text, text, text, text, boolean)
  from anon, authenticated;
grant execute on function public.register_for_event(uuid, text, text, text, text, text, text, boolean)
  to service_role;

comment on function public.register_for_event(uuid, text, text, text, text, text, text, boolean) is
  'The only way a booking is created. Locks the event row, refuses drafts, events that have started, and full events (holds_seat), then inserts. Refusals carry a code. service_role only.';

-- ---------------------------------------------------------------------------
-- 5. Each event, as the admin sees it
-- ---------------------------------------------------------------------------
-- The first three columns are the ones the dashboard already reads, in the
-- same order, so this can replace the view in place; everything after them
-- is new.
--
--   waiting            In line: not claimed, not removed, and not holding a
--                      live offer. Someone whose offer lapsed is back in line.
--   pending_payments   Checkouts still inside the hold window.
--   refund_requested   Marked by her and not yet refunded.
--   offers_open        Holding a claim link that has not lapsed.
--   refunded           Refunded bookings.
--   taken, capacity    Seats, through holds_seat() like the public count.
--   status             draft; upcoming (not started); ongoing (started, not
--                      ended); ended_pending (ended with a payment or refund
--                      still pending); archived (ended, nothing pending). The
--                      waiting list does not keep an event out of the
--                      archive: once it is over, nobody can be offered a seat.
--
-- security_invoker, as before: the admin-only policies on the tables below
-- decide what is counted, and visitors have no grant at all.
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
        and r.removed_at is null
        and r.payment_status = 'pending'
        and r.created_at > now() - public.pending_hold_interval())::int as pending_payments,
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

comment on view public.admin_event_overview is
  'Per event: status (draft, upcoming, ongoing, ended_pending, archived), seats taken and capacity, and the five numbers: waiting, pending_payments, refund_requested, offers_open, refunded. security_invoker, admin-only through the underlying policies.';

-- ---------------------------------------------------------------------------
-- 6. The dashboard counts the Upcoming tab
-- ---------------------------------------------------------------------------
-- The dashboard's "Evenimente" row opens the admin list on its Upcoming tab,
-- so it counts exactly what that tab holds: events that have not started,
-- are under way, or have ended with a payment or refund still pending.
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
    where not t.approved)::int as pending_testimonials;

-- ---------------------------------------------------------------------------
-- 7. Publishing a live event's changes
-- ---------------------------------------------------------------------------
-- Like publish_post_draft(): copies each field present in the event's
-- content_drafts row onto the event and deletes the row, in one transaction.
--
-- Once the event has ended, its date, times, price, currency and places are
-- left as they are, whatever the draft says: they are what people booked and
-- paid for. The editor locks those fields too; this is the rule, the editor
-- only says so.
--
-- security invoker: the admin-only policies on both tables decide, and only
-- `authenticated` may execute it.
create or replace function public.publish_event_draft(p_event_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d       jsonb;
  v_ended boolean;
begin
  select data into d from public.content_drafts where event_id = p_event_id;
  if d is null then
    return;
  end if;

  select e.ends_at <= now() into v_ended from public.events e where e.id = p_event_id;
  v_ended := coalesce(v_ended, true);

  update public.events e set
    slug                = case when d ? 'slug' then coalesce(d->>'slug', e.slug) else e.slug end,
    title_ro            = case when d ? 'title_ro' then coalesce(d->>'title_ro', '') else e.title_ro end,
    title_en            = case when d ? 'title_en' then d->>'title_en' else e.title_en end,
    description_ro      = case when d ? 'description_ro' then d->>'description_ro' else e.description_ro end,
    description_en      = case when d ? 'description_en' then d->>'description_en' else e.description_en end,
    location            = case when d ? 'location' then d->>'location' else e.location end,
    map_link            = case when d ? 'map_link' then d->>'map_link' else e.map_link end,
    image_url           = case when d ? 'image_url' then d->>'image_url' else e.image_url end,
    whatsapp_group_link = case when d ? 'whatsapp_group_link' then d->>'whatsapp_group_link' else e.whatsapp_group_link end,
    date                = case when not v_ended and d ? 'date' then coalesce((d->>'date')::date, e.date) else e.date end,
    time                = case when not v_ended and d ? 'time' then (d->>'time')::time else e.time end,
    end_date            = case when not v_ended and d ? 'end_date' then (d->>'end_date')::date else e.end_date end,
    end_time            = case when not v_ended and d ? 'end_time' then (d->>'end_time')::time else e.end_time end,
    price               = case when not v_ended and d ? 'price' then coalesce((d->>'price')::integer, e.price) else e.price end,
    currency            = case when not v_ended and d ? 'currency' then coalesce(d->>'currency', e.currency) else e.currency end,
    max_participants    = case when not v_ended and d ? 'max_participants' then (d->>'max_participants')::integer else e.max_participants end
  where e.id = p_event_id;

  delete from public.content_drafts where event_id = p_event_id;
end;
$$;

revoke all on function public.publish_event_draft(uuid) from public;
revoke all on function public.publish_event_draft(uuid) from anon, authenticated, service_role;
grant execute on function public.publish_event_draft(uuid) to authenticated;

comment on function public.publish_event_draft(uuid) is
  'Admin: applies an event''s content_drafts row to the event and deletes it, atomically. Leaves date, times, price, currency and places alone once the event has ended. security invoker, so RLS limits it to the admin.';
