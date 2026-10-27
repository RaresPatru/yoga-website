-- ===========================================================================
-- Discount codes: who received one by email, and who used one
-- ===========================================================================
--
-- Her discount codes live in Stripe (lib/promotion-codes.ts says why), and
-- Stripe knows how often each was used at checkout. What it cannot know is
-- who was told about a code: she hands them out inside her announcements.
-- That is recorded here, so that before she deletes or changes a code the
-- site can say who received it, and so the Registrations page can show it.
--
--   announcement_codes       One row per code an announcement carried, and
--                            which of its two versions had it: in_ro for the
--                            Romanian subject and text, in_en for what an
--                            English reader was sent (the English text, or
--                            the Romanian where she wrote none). Written by
--                            the server, from the codes that existed in
--                            Stripe when the announcement went out
--                            (lib/announcement-codes.ts).
--
--   announcements
--     codes_checked_at       When the server looked for codes in it. NULL
--                            means not yet: it went out before this existed,
--                            or Stripe could not be reached while it was sent.
--                            The codes screen looks again whenever it opens.
--
--   admin_code_recipients    View. One row per code and person who received
--                            it: their email went out, and the version they
--                            were sent (by their language) carried the code.
--
--   admin_participants       Gains received_codes (every code their address
--                            received), code_received and code_used: the two
--                            extra choices of the Registrations status filter.

-- ---------------------------------------------------------------------------
-- 1. The codes each announcement carried
-- ---------------------------------------------------------------------------
-- The code is stored as people are shown it, in capitals; Stripe matches
-- codes regardless of case, and so do the queries that read this.
create table public.announcement_codes (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  code            text not null,
  in_ro           boolean not null,
  in_en           boolean not null,
  primary key (announcement_id, code),
  constraint announcement_codes_code_in_capitals
    check (code = upper(code) and length(code) between 1 and 100),
  constraint announcement_codes_in_a_version
    check (in_ro or in_en)
);

-- She reads it; only the server writes it, as with the recipients.
alter table public.announcement_codes enable row level security;

drop policy if exists "Admins read announcement codes" on public.announcement_codes;
create policy "Admins read announcement codes"
  on public.announcement_codes for select to authenticated
  using (public.is_admin());

revoke all on public.announcement_codes from anon, authenticated, service_role;
grant select on public.announcement_codes to authenticated;
grant select, insert, update, delete on public.announcement_codes to service_role;

-- "Who received VARA10" reads it by code.
create index announcement_codes_code on public.announcement_codes (code);

comment on table public.announcement_codes is
  'Which of her discount codes each announcement carried (code in capitals), and in which version: in_ro for the Romanian, in_en for what English readers were sent. Written by the server from the codes that existed in Stripe when it went out. Admin reads, server writes.';

alter table public.announcements
  add column codes_checked_at timestamptz;

comment on column public.announcements.codes_checked_at is
  'When the server looked for discount codes in it (announcement_codes). NULL: not yet; the codes screen looks again when it opens.';

-- ---------------------------------------------------------------------------
-- 2. Who received each code
-- ---------------------------------------------------------------------------
-- A person received a code when their email went out (status sent) and the
-- version they were sent carried it: an English reader got the English
-- version, everyone else the Romanian one. security_invoker, so the
-- admin-only policies underneath decide who sees anything.
create view public.admin_code_recipients
with (security_invoker = true)
as
select
  c.code,
  r.email,
  r.full_name,
  r.locale,
  a.id                            as announcement_id,
  a.subject_ro                    as announcement_subject,
  coalesce(r.sent_at, a.sent_at)  as sent_at
from public.announcement_codes c
join public.announcements a on a.id = c.announcement_id
join public.announcement_recipients r on r.announcement_id = c.announcement_id
where r.status = 'sent'
  and case when r.locale = 'en' then c.in_en else c.in_ro end;

revoke all on public.admin_code_recipients from anon, authenticated, service_role;
grant select on public.admin_code_recipients to authenticated;
grant select on public.admin_code_recipients to service_role;

comment on view public.admin_code_recipients is
  'Admin: one row per discount code and person it was emailed to (announcement_codes joined to the recipients whose email went out and whose version carried the code), with the announcement and when. security_invoker.';

-- Everyone a person received is looked up by their address, among the sent.
create index announcement_recipients_sent_email
  on public.announcement_recipients (email)
  where status = 'sent';

-- ---------------------------------------------------------------------------
-- 3. Codes on the Registrations page
-- ---------------------------------------------------------------------------
-- The same view as 20261003000000_payments.sql made it, with three columns
-- added at the end, which `create or replace` allows:
--
--   received_codes  every code their address received in an announcement,
--                   in alphabetical order, or NULL
--   code_received   they received at least one
--   code_used       this booking was paid with a code
--
-- Subqueries in the select list rather than a join, so the counts and pages
-- that never ask for them do not pay for them.
create or replace view public.admin_participants
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
                  as search_text,
  (
    select array_agg(distinct x.code order by x.code)
    from public.admin_code_recipients x
    where x.email = lower(p.email)
  )               as received_codes,
  exists (
    select 1
    from public.admin_code_recipients x
    where x.email = lower(p.email)
  )               as code_received,
  p.discount_code is not null
                  as code_used
from people p
join public.events e on e.id = p.event_id;

-- Stated again, as every migration that touches this view does: replacing a
-- view keeps its grants, but nothing here should depend on remembering that.
revoke all on public.admin_participants from anon, authenticated, service_role;
grant select on public.admin_participants to authenticated;
grant select on public.admin_participants to service_role;

comment on view public.admin_participants is
  'Admin: every booking and every unclaimed waiting-list entry, with its event, a status (removed, refunded, refund_requested, cancelled, pending, abandoned, paid, free, offers, waitlist), what was paid, archived, search_text, and discount codes (received_codes, code_received, code_used). security_invoker, admin-only through the underlying policies; the service role reads it for announcements.';

comment on column public.admin_participants.received_codes is
  'Every discount code this address received in an announcement (admin_code_recipients), alphabetical, or NULL.';
comment on column public.admin_participants.code_received is
  'This address received at least one discount code by email.';
comment on column public.admin_participants.code_used is
  'This booking was paid with a discount code (discount_code is set).';
