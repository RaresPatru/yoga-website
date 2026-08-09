-- ============================================================================
-- Stop abandoned checkouts from holding a seat forever
-- ============================================================================
--
-- THE PROBLEM
--
-- Booking a paid event is two requests: /api/register creates a 'pending'
-- registration, then the browser calls /api/stripe/checkout to get a payment
-- link. A 'pending' row counts towards capacity — correctly, because someone
-- mid-checkout is holding that seat.
--
-- Normally the seat comes back on its own: if they never pay, Stripe fires
-- checkout.session.expired and the webhook deletes the row.
--
-- But that only works if a Stripe session was ever created. If the second
-- request never happens — the tab is closed, the network drops, the checkout
-- route itself errors — there is no session, so there is no expiry event, so
-- nothing ever deletes the row. The seat is consumed permanently by someone who
-- never even saw a payment page. On a twelve-person workshop, a handful of
-- those quietly makes the event look full.
--
-- THE FIX
--
-- Treat a 'pending' registration older than an hour as abandoned, in both
-- places that count seats. Stripe sessions are created with a 30-minute expiry
-- (see app/api/stripe/checkout/route.ts), so an hour leaves generous room for
-- the webhook to arrive before we assume anything.
--
-- The rows are not deleted — they stay for the record, and the admin
-- registrations list still shows them as 'În așteptare'. They simply stop
-- occupying a seat.
--
-- Chosen over a scheduled cleanup job because it needs no scheduler and cannot
-- drift: the count is correct the moment it is asked for, whether or not any
-- background task ran.
-- ============================================================================

-- How long a 'pending' registration may hold a seat without payment.
-- Kept in one place so the view and the function cannot disagree.
create or replace function public.pending_hold_interval()
returns interval
language sql
immutable
set search_path = public, pg_temp
as $$ select interval '1 hour' $$;

grant execute on function public.pending_hold_interval() to anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- The public seat count
-- ---------------------------------------------------------------------------
create or replace view public.event_availability as
select
  e.id                as event_id,
  e.max_participants  as capacity,
  count(r.id)         as taken
from public.events e
left join public.registrations r
  on r.event_id = e.id
  -- Refunded people are not attending; their seat is free again.
  and r.payment_status <> 'refunded'
  -- A pending checkout holds its seat, but only for a bounded window.
  and (
    r.payment_status <> 'pending'
    or r.created_at > now() - public.pending_hold_interval()
  )
where e.published = true
group by e.id, e.max_participants;

grant select on public.event_availability to anon, authenticated;


-- ---------------------------------------------------------------------------
-- The capacity check that actually admits people
-- ---------------------------------------------------------------------------
-- Same rule as the view. When the displayed number and the enforced rule
-- disagree you get the worst kind of bug: a page offering seats next to a
-- button that refuses them.
CREATE OR REPLACE FUNCTION register_for_event(
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
  IF p_payment_status NOT IN ('free', 'pending', 'completed', 'refunded') THEN
    RETURN jsonb_build_object('error', 'Invalid payment status.');
  END IF;

  -- FOR UPDATE locks this event's row until the transaction ends, so two
  -- simultaneous bookings are serialised rather than both seeing the same
  -- count and both succeeding.
  SELECT max_participants, published
    INTO v_max_participants, v_published
    FROM events
   WHERE id = p_event_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Evenimentul nu există.');
  END IF;

  IF v_published IS NOT TRUE THEN
    RETURN jsonb_build_object('error', 'Evenimentul nu este disponibil.');
  END IF;

  SELECT COUNT(*)
    INTO v_current_count
    FROM registrations
   WHERE event_id = p_event_id
     AND payment_status <> 'refunded'
     AND (
       payment_status <> 'pending'
       OR created_at > now() - public.pending_hold_interval()
     );

  IF v_max_participants IS NOT NULL AND v_current_count >= v_max_participants THEN
    RETURN jsonb_build_object('error', 'Evenimentul este complet.');
  END IF;

  INSERT INTO registrations (event_id, full_name, email, phone, payment_status)
  VALUES (p_event_id, p_full_name, p_email, p_phone, p_payment_status)
  RETURNING id INTO v_registration_id;

  RETURN jsonb_build_object('success', true, 'id', v_registration_id);
END;
$$;

REVOKE ALL ON FUNCTION register_for_event(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION register_for_event(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
