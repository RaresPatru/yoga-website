-- ---------------------------------------------------------------------------
-- A capacity nobody set means nobody can book
-- ---------------------------------------------------------------------------
--
-- WHAT CHANGES
--
-- `max_participants` used to mean: NULL = unlimited, and zero was forbidden
-- outright. It now means the opposite at the bottom end:
--
--     NULL  -- she has not said how many fit. Sold out; waiting list only.
--     0     -- she is saying it is already full. Sold out; waiting list only.
--     n > 0 -- n seats, booking open until they are gone.
--
-- There is no longer a way to express "unlimited", and that is deliberate.
--
-- WHY
--
-- The old default failed open. An event saved without a number was bookable by
-- an unbounded number of people, and nothing on the page said so — the seat
-- count renders nothing when there is no capacity, so the card looked identical
-- to one with seats left and the registration panel took bookings forever. For
-- a solo instructor teaching in rooms with a fixed number of mats, a capacity
-- she forgot to type is a mistake, not a decision to teach everybody who turns
-- up. The safe reading of a blank field is "not yet open", which is what it now
-- means. Security checks fail closed here; so does this.
--
-- Zero becomes legal so she can close bookings without unpublishing the event:
-- the date stays public, the page keeps collecting a waiting list, and nobody
-- can book. Before this she could not publish a full event at all without
-- inviting bookings she could not honour.
--
-- HOW A CLOSED EVENT OPENS AGAIN
--
-- By her raising the number, and only by that. Registration happens here and
-- nowhere else, so with a capacity of 0 there is no seat for anyone to claim —
-- a refund does not create one, because 0 seats minus a refund is still 0. The
-- waiting list is therefore a queue that only an edit of hers can release, and
-- lib/notify-waiting-list.ts is what releases it: saving the event emails the
-- front of the queue, in order, once there are seats to offer.
--
-- That function counts the seats itself, from `event_availability` — the same
-- view this one is written to agree with. Anything that emails a claim link
-- without asking it first will send links that the gate below refuses.
--
-- Nothing is migrated. Existing rows keep their values; the ones with NULL stop
-- accepting bookings, which is the point.

-- ---------------------------------------------------------------------------
-- 1. Let zero through
-- ---------------------------------------------------------------------------
-- Negatives stay rejected: a capacity of minus four is a typo in every case,
-- and `taken >= capacity` would read it as sold out anyway, so allowing it
-- would only hide the mistake.
alter table public.events drop constraint if exists events_capacity_positive;
alter table public.events drop constraint if exists events_capacity_non_negative;
alter table public.events add  constraint events_capacity_non_negative
  check (max_participants is null or max_participants >= 0);

-- ---------------------------------------------------------------------------
-- 2. The booking gate
-- ---------------------------------------------------------------------------
-- This function is the only way a registration row is created, and it is the
-- line that actually enforces any of the above: the form on the event page can
-- be hidden, re-shown by anyone with developer tools, or skipped entirely by
-- posting to /api/register. Hiding a form is presentation. This is the rule.
--
-- Only the capacity comparison changes. Everything else — the FOR UPDATE lock
-- that closes the overbooking race, the published check, the seat-counting
-- window that must match `event_availability` exactly — is carried over
-- unaltered from the baseline, because a `create or replace` replaces the whole
-- body and quietly dropping any of it would reopen a bug that has already been
-- fixed once.
create or replace function public.register_for_event(
  p_event_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_payment_status TEXT DEFAULT 'free'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_participants INTEGER;
  v_published        BOOLEAN;
  v_current_count    INTEGER;
  v_registration_id  UUID;
BEGIN
  -- Guard against a status the caller made up. The table has a CHECK covering
  -- these too; this returns clean JSON instead of a raw constraint violation.
  IF p_payment_status NOT IN ('free', 'pending', 'completed', 'refunded') THEN
    RETURN jsonb_build_object('error', 'Invalid payment status.');
  END IF;

  SELECT max_participants, published
    INTO v_max_participants, v_published
    FROM events
   WHERE id = p_event_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Evenimentul nu există.');
  END IF;

  -- Draft events are not bookable. The API checks this too, but a rule this
  -- important belongs next to the data as well.
  IF v_published IS NOT TRUE THEN
    RETURN jsonb_build_object('error', 'Evenimentul nu este disponibil.');
  END IF;

  -- Must match event_availability exactly. See the note above.
  SELECT COUNT(*)
    INTO v_current_count
    FROM registrations
   WHERE event_id = p_event_id
     AND payment_status <> 'refunded'
     AND (
       payment_status <> 'pending'
       OR created_at > now() - public.pending_hold_interval()
     );

  -- THE CHANGED LINE. It used to read
  --     IF v_max_participants IS NOT NULL AND v_current_count >= v_max_participants
  -- so a NULL capacity skipped the check and admitted everyone. NULL is now a
  -- refusal, and zero refuses on its own because any count is >= 0.
  IF v_max_participants IS NULL OR v_current_count >= v_max_participants THEN
    RETURN jsonb_build_object('error', 'Evenimentul este complet.');
  END IF;

  INSERT INTO registrations (event_id, full_name, email, phone, payment_status)
  VALUES (p_event_id, p_full_name, p_email, p_phone, p_payment_status)
  RETURNING id INTO v_registration_id;

  RETURN jsonb_build_object('success', true, 'id', v_registration_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Who may call it
-- ---------------------------------------------------------------------------
-- `create or replace` keeps the privileges the function already had, so these
-- are a restatement rather than a change. They are here because a reader
-- arriving at this file should be able to see what every role may do without
-- opening the baseline, and because the day somebody replaces this function
-- with `drop` + `create` instead, the grants would silently reset to Postgres's
-- default — which includes EXECUTE for PUBLIC.
--
-- `from public` is the line that does the work. Revoking anon and authenticated
-- by name is not sufficient and previously was not: both inherit EXECUTE from
-- the PUBLIC grant Postgres adds at creation time. Letting the browser call
-- this directly would skip the CAPTCHA, the rate limiter and the validation in
-- /api/register, and `p_payment_status => 'completed'` would then book a paid
-- event without paying.
--
-- tests/rpc-exposure.spec.ts calls this over HTTP with the publishable key and
-- expects a refusal.
revoke all on function public.register_for_event(UUID, TEXT, TEXT, TEXT, TEXT)
  from public;
revoke all on function public.register_for_event(UUID, TEXT, TEXT, TEXT, TEXT)
  from anon, authenticated;
grant execute on function public.register_for_event(UUID, TEXT, TEXT, TEXT, TEXT)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Say so on the object itself
-- ---------------------------------------------------------------------------
-- `20260912000001_object_comments.sql` documented the old meaning, and that
-- file is history now — `db push` will never re-run it, so it cannot be edited
-- into being right. This supersedes it.
comment on column public.events.max_participants is
  'Seats. NULL or 0 means sold out (waiting list only); n > 0 means n seats. There is no unlimited. Enforced in register_for_event().';

comment on function public.register_for_event(UUID, TEXT, TEXT, TEXT, TEXT) is
  'Capacity check and insert in one transaction, locking the event row with FOR UPDATE to prevent overbooking. NULL or 0 capacity refuses every booking. service_role only.';
