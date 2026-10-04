-- ===========================================================================
-- Participants: one list of bookings and waiting list, and the daily clean-up
-- ===========================================================================
--
-- What this adds, and why:
--
--   waiting_list
--     participant_note,      The booking form's optional note and marketing
--     note_consent_at,       opt-in, asked on the waiting-list form too, so a
--     marketing_consent_at   person who later claims a seat brings them along.
--     admin_note             Her own note, as on a booking.
--
--   register_for_event()     Takes the moment the person consented
--                            (p_consented_at), so a note written on the
--                            waiting list keeps its real consent time when the
--                            seat is claimed days later. Blank means now.
--
--   admin_participants       One row per booking and per waiting-list entry
--                            still waiting, with its event, a status, whether
--                            it is archived, and a search text. The admin's
--                            Registrations page reads only this.
--
--   admin_delete_participants(ids)
--                            Deletes rows for good, but only archived ones.
--
--   daily_cleanup()          What /api/cron/daily runs once a day: notes are
--                            cleared 30 days after their event, and checkouts
--                            nobody finished are deleted after a week.
--
--   email_templates          booking_cancelled and waitlist_removed: the
--                            emails she can send when she removes someone.
--
--   The privacy policy draft gains the note, the opt-in and their retention,
--   if its sentences are still the ones 20260925000000 wrote.

-- ---------------------------------------------------------------------------
-- 1. The waiting list records what the booking form records
-- ---------------------------------------------------------------------------
alter table public.waiting_list
  add column participant_note     text,
  add column note_consent_at      timestamptz,
  add column marketing_consent_at timestamptz,
  add column admin_note           text;

alter table public.waiting_list
  add constraint waiting_list_note_needs_consent
    check (participant_note is null or note_consent_at is not null);

comment on column public.waiting_list.participant_note is
  'Optional note from the person, often about health. Only stored with note_consent_at. Carried to the booking when they claim a seat; cleared 30 days after the event.';
comment on column public.waiting_list.note_consent_at is
  'When the person consented to their note being kept.';
comment on column public.waiting_list.marketing_consent_at is
  'When they opted in to promotional email, or NULL for no.';
comment on column public.waiting_list.admin_note is
  'The admin''s own note about this person. Never shown to them; cleared 30 days after the event.';

-- ---------------------------------------------------------------------------
-- 2. The booking gate keeps the real consent time
-- ---------------------------------------------------------------------------
-- Dropped and created, not replaced, because the argument list grows: a
-- replace would leave the eight-argument version behind as a second function,
-- callable by whoever holds its grants. Everything else is as
-- 20260927000000_registration_lifecycle.sql wrote it.
drop function public.register_for_event(uuid, text, text, text, text, text, text, boolean);

create function public.register_for_event(
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
    case when v_note is not null then v_consented_at end,
    case when p_marketing_opt_in then v_consented_at end
  )
  returning id into v_registration_id;

  return jsonb_build_object('success', true, 'id', v_registration_id);
end;
$$;

-- `from public` does the work: Postgres grants EXECUTE to PUBLIC when a
-- function is created. tests/rpc-exposure.spec.ts calls this with the
-- publishable key and expects a refusal.
revoke all on function public.register_for_event(uuid, text, text, text, text, text, text, boolean, timestamptz)
  from public;
revoke all on function public.register_for_event(uuid, text, text, text, text, text, text, boolean, timestamptz)
  from anon, authenticated;
grant execute on function public.register_for_event(uuid, text, text, text, text, text, text, boolean, timestamptz)
  to service_role;

comment on function public.register_for_event(uuid, text, text, text, text, text, text, boolean, timestamptz) is
  'The only way a booking is created. Locks the event row, refuses drafts, events that have started, and full events (holds_seat), then inserts. p_consented_at is when the note and opt-in were given (default now). Refusals carry a code. service_role only.';

-- ---------------------------------------------------------------------------
-- 3. Everyone on one list
-- ---------------------------------------------------------------------------
-- Bookings and waiting-list entries side by side. A waiting-list entry that
-- claimed its seat is left out: its booking is the row that stands for that
-- person now.
--
-- status, one word per row, first match wins:
--   removed           she took them off (booking or waiting list)
--   refunded          the money went back
--   refund_requested  she marked a refund as asked for
--   pending           a checkout still inside pending_hold_interval()
--   abandoned         a checkout older than that, never paid
--   paid, free        a booking that holds its seat
--   offers            on the waiting list, holding a live claim link
--   waitlist          on the waiting list, in line
--
-- archived, the rule for the page's two tabs:
--   A booking is archived once removed, or once its event has ended with
--   nothing pending on it (no checkout inside the hold, no refund asked for
--   and not yet made). A waiting-list entry is archived once removed or once
--   its event has ended: nobody can be offered a seat after that.
--
-- search_text is lowercase with the accents taken off, the way the page
-- lowers and strips what she types (searchable() in lib/admin/blog.ts), so
-- "ionut" finds "Ionuț". The phone number follows as bare digits.
--
-- security_invoker: the admin-only policies on registrations and
-- waiting_list decide what anybody sees here. Visitors have no grant.
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
      when r.payment_status = 'pending'
       and r.created_at > now() - public.pending_hold_interval() then 'pending'
      when r.payment_status = 'pending' then 'abandoned'
      when r.payment_status = 'completed' then 'paid'
      else 'free'
    end                              as status
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
    end
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
  case
    when p.status = 'removed' then true
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

-- Stated in full rather than inherited: a new view picks up different default
-- privileges locally and in production (CLAUDE.md).
revoke all on public.admin_participants from anon, authenticated, service_role;
grant select on public.admin_participants to authenticated;

comment on view public.admin_participants is
  'Admin: every booking and every unclaimed waiting-list entry, with its event, a status (removed, refunded, refund_requested, pending, abandoned, paid, free, offers, waitlist), archived, and search_text. security_invoker, admin-only through the underlying policies.';

-- ---------------------------------------------------------------------------
-- 4. Deleting for good, from the archive only
-- ---------------------------------------------------------------------------
-- The page offers deletion only in its Archive tab. This is where that rule
-- holds: any id that is not archived is skipped, whatever the page sent.
--
-- A booking made from a waiting-list claim leaves the claimed entry behind,
-- hidden from the list. It goes with the booking, so deleting a person
-- leaves nothing of them on that event.
--
-- security invoker: the admin-only policies decide, and only
-- `authenticated` may execute it. Returns how many rows went.
create function public.admin_delete_participants(p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bookings uuid[];
  v_waiting  uuid[];
  v_deleted  integer := 0;
  v_rows     integer;
begin
  select coalesce(array_agg(p.id) filter (where p.kind = 'booking'), '{}'),
         coalesce(array_agg(p.id) filter (where p.kind = 'waitlist'), '{}')
    into v_bookings, v_waiting
    from public.admin_participants p
   where p.id = any(p_ids)
     and p.archived;

  delete from public.waiting_list w where w.claimed_registration_id = any(v_bookings);

  delete from public.registrations r where r.id = any(v_bookings);
  get diagnostics v_rows = row_count;
  v_deleted := v_deleted + v_rows;

  delete from public.waiting_list w where w.id = any(v_waiting);
  get diagnostics v_rows = row_count;
  v_deleted := v_deleted + v_rows;

  return v_deleted;
end;
$$;

revoke all on function public.admin_delete_participants(uuid[]) from public;
revoke all on function public.admin_delete_participants(uuid[]) from anon, authenticated, service_role;
grant execute on function public.admin_delete_participants(uuid[]) to authenticated;

comment on function public.admin_delete_participants(uuid[]) is
  'Admin: permanently deletes the given participants (admin_participants ids), skipping any that are not archived. security invoker; returns the number deleted.';

-- ---------------------------------------------------------------------------
-- 5. Once a day
-- ---------------------------------------------------------------------------
-- Run by /api/cron/daily with the service key.
--
--   Notes, 30 days after the event ends. A participant's note is often about
--   their health, which GDPR treats as special, and the booking form promises
--   it goes then. Her own notes go at the same time: they are about the same
--   people and can hold the same kind of thing. When they consented stays, as
--   the record that they did.
--
--   Checkouts nobody finished, after seven days. A pending booking stops
--   holding its seat after pending_hold_interval() and Stripe closes the
--   session after 30 minutes, but a payment made in the last of those minutes
--   can still be reported late: Stripe retries a webhook it could not deliver
--   for up to three days. Deleting the row sooner could leave a payment with
--   no booking to mark as paid. Anyone who had claimed that seat from the
--   waiting list goes back in line, as the webhook does when a session
--   expires.
--
-- Returns how many rows each step touched.
create function public.daily_cleanup()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_notes     integer := 0;
  v_abandoned integer := 0;
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

  return jsonb_build_object('notes_cleared', v_notes, 'abandoned_removed', v_abandoned);
end;
$$;

revoke all on function public.daily_cleanup() from public;
revoke all on function public.daily_cleanup() from anon, authenticated, service_role;
grant execute on function public.daily_cleanup() to service_role;

comment on function public.daily_cleanup() is
  'Run daily by /api/cron/daily: clears participant and admin notes 30 days after the event ends, deletes pending bookings older than 7 days (returning any waiting-list claim on them to the queue). service_role only.';

-- ---------------------------------------------------------------------------
-- 6. The emails a removal can send
-- ---------------------------------------------------------------------------
-- Sent only when she ticks the box in the removal dialog, in the language the
-- person booked in. Her reason for removing them stays with her and is not in
-- the email. She rewords both at /admin/emails.
alter table public.email_templates drop constraint email_templates_type_check;
alter table public.email_templates
  add constraint email_templates_type_check
    check (type in ('registration_confirmation', 'payment_confirmation',
                    'testimonial_request', 'spot_available',
                    'booking_cancelled', 'waitlist_removed'));

insert into public.email_templates (type, subject_ro, body_ro, subject_en, body_en) values
('booking_cancelled',
 'Înscriere anulată - {{event_name}}',
 '<h2>Salut {{user_name}}!</h2><p>Înscrierea ta la <strong>{{event_name}}</strong> ({{event_date}}) a fost anulată, iar locul tău a fost eliberat.</p>',
 'Booking cancelled - {{event_name}}',
 '<h2>Hi {{user_name}}!</h2><p>Your booking for <strong>{{event_name}}</strong> ({{event_date}}) has been cancelled, and your place has been released.</p>'),
('waitlist_removed',
 'Lista de așteptare - {{event_name}}',
 '<h2>Salut {{user_name}}!</h2><p>Nu mai ești pe lista de așteptare pentru <strong>{{event_name}}</strong> ({{event_date}}).</p>',
 'Waiting list - {{event_name}}',
 '<h2>Hi {{user_name}}!</h2><p>You are no longer on the waiting list for <strong>{{event_name}}</strong> ({{event_date}}).</p>')
on conflict (type) do nothing;

-- ---------------------------------------------------------------------------
-- 7. The privacy policy says what the forms now ask
-- ---------------------------------------------------------------------------
-- Each change finds a sentence the 25 September draft wrote and adds after or
-- in place of it. A sentence she has already reworded is not found, and her
-- text is left exactly as it is; one already changed here is not changed
-- twice.
--
-- The waiting list is kept as long as bookings are, rather than until the
-- event ends as the draft said: the admin's archive keeps past waiting lists,
-- and the policy has to describe what the site does.
update public.site_content
   set value_ro = replace(
         value_ro,
         '<li><p><strong>Când intri pe lista de așteptare</strong>: aceleași date, ca să te anunțăm dacă se eliberează un loc.</p></li>',
         '<li><p><strong>Când intri pe lista de așteptare</strong>: aceleași date, ca să te anunțăm dacă se eliberează un loc.</p></li>'
         || '<li><p><strong>Dacă ne lași o notă când te înscrii</strong>, de exemplu despre o accidentare sau o sarcină: o păstrăm doar dacă bifezi că ești de acord. O citește doar organizatoarea, ca să știe de ea la eveniment, și o ștergem la 30 de zile după eveniment. Temeiul este acordul tău explicit, pe care îl poți retrage oricând.</p></li>'
         || '<li><p><strong>Dacă bifezi că vrei să afli de evenimentele viitoare</strong>: adresa de email, ca să îți scriem despre ele. Temeiul este acordul tău, pe care îl poți retrage oricând.</p></li>'
       )
 where key = 'legal.privacy'
   and position('Dacă ne lași o notă când te înscrii' in value_ro) = 0;

update public.site_content
   set value_ro = replace(
         value_ro,
         '<li><p>Lista de așteptare: până la încheierea evenimentului.</p></li>',
         '<li><p>Lista de așteptare: la fel ca înscrierile, 3 ani de la data evenimentului.</p></li>'
         || '<li><p>Notele lăsate la înscriere și notele organizatoarei despre participanți: 30 de zile de la încheierea evenimentului.</p></li>'
       )
 where key = 'legal.privacy';

update public.site_content
   set value_en = replace(
         value_en,
         '<li><p><strong>When you join a waiting list</strong>: the same details, so we can tell you if a place frees up.</p></li>',
         '<li><p><strong>When you join a waiting list</strong>: the same details, so we can tell you if a place frees up.</p></li>'
         || '<li><p><strong>If you leave us a note when you book</strong>, for example about an injury or a pregnancy: we keep it only if you tick that you agree. Only the organiser reads it, so she knows about it at the event, and we delete it 30 days after the event. The legal basis is your explicit consent, which you can withdraw at any time.</p></li>'
         || '<li><p><strong>If you tick that you want to hear about future events</strong>: your email address, so we can write to you about them. The legal basis is your consent, which you can withdraw at any time.</p></li>'
       )
 where key = 'legal.privacy'
   and position('If you leave us a note when you book' in value_en) = 0;

update public.site_content
   set value_en = replace(
         value_en,
         '<li><p>Waiting lists: until the event has ended.</p></li>',
         '<li><p>Waiting lists: as long as bookings, 3 years from the date of the event.</p></li>'
         || '<li><p>Notes left when booking, and the organiser''s notes about participants: 30 days from the end of the event.</p></li>'
       )
 where key = 'legal.privacy';
