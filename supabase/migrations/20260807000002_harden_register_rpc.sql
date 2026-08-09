-- ============================================================================
-- Harden register_for_event()
-- ============================================================================
--
-- This function is the only way a registration row gets created. It exists to
-- solve a race condition, and this migration fixes three problems with it.
--
-- WHY A DATABASE FUNCTION AT ALL?
--
-- The obvious way to enforce "max 15 people" is to count the registrations,
-- compare, then insert. In application code that is a bug waiting to happen:
-- two people submitting at the same moment both count 14, both decide there is
-- room, and both insert. You end up with 16. This is a classic race condition,
-- and no amount of JavaScript fixes it, because the gap between the count and
-- the insert is where the problem lives.
--
-- Moving both steps into one database function closes the gap. Everything
-- inside runs in a single transaction, and `FOR UPDATE` on the events row makes
-- the second caller wait until the first has finished. By the time it counts,
-- it sees the updated number. Sequential, not simultaneous.
--
-- WHAT THIS MIGRATION CHANGES
--
--   1. SET search_path — closes a privilege-escalation hole (details below).
--   2. Rejects unpublished or non-existent events.
--   3. Stops counting refunded registrations against the capacity.
--
-- Problem 3 was breaking the refund flow in a way that is easy to miss. When a
-- customer was refunded, the Stripe webhook marked their row 'refunded' and
-- then notified the waiting list that a spot had opened. But this function
-- counted *every* row regardless of status, so the refunded row still occupied
-- its seat. The person on the waiting list clicked their claim link and was
-- told "Evenimentul este complet." The spot was never really freed.
-- ============================================================================

CREATE OR REPLACE FUNCTION register_for_event(
  p_event_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_payment_status TEXT DEFAULT 'free'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
-- Pins the schemas this function searches when it resolves names like
-- `events`. Without it, someone able to create objects could define their own
-- `events` table in a schema that gets searched first and have this function —
-- which runs with elevated privileges — operate on their table instead of the
-- real one. Supabase's database linter flags every SECURITY DEFINER function
-- missing this, and it is the single most common finding on Supabase projects.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_participants INTEGER;
  v_published        BOOLEAN;
  v_current_count    INTEGER;
  v_registration_id  UUID;
BEGIN
  -- Guard against a payment status the caller made up. The registrations table
  -- has a CHECK constraint covering these values too; this returns a clean JSON
  -- error instead of a raw constraint violation.
  IF p_payment_status NOT IN ('free', 'pending', 'completed', 'refunded') THEN
    RETURN jsonb_build_object('error', 'Invalid payment status.');
  END IF;

  -- FOR UPDATE locks this event's row until the transaction ends. Any other
  -- registration for the SAME event queues here; registrations for other events
  -- are unaffected, because the lock is per row rather than per table.
  SELECT max_participants, published
    INTO v_max_participants, v_published
    FROM events
   WHERE id = p_event_id
     FOR UPDATE;

  -- NOT FOUND is set by the SELECT above when no row matched.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Evenimentul nu există.');
  END IF;

  -- Draft events are not bookable. The API checks this too, but a rule this
  -- important belongs next to the data as well: anything that bypasses the API
  -- still cannot book a draft.
  IF v_published IS NOT TRUE THEN
    RETURN jsonb_build_object('error', 'Evenimentul nu este disponibil.');
  END IF;

  -- A NULL max_participants means unlimited, so the capacity check is skipped
  -- entirely below.
  SELECT COUNT(*)
    INTO v_current_count
    FROM registrations
   WHERE event_id = p_event_id
     -- Refunded people are no longer attending, so their seat is free again.
     -- This is the fix that makes refund -> waiting-list notification -> claim
     -- actually work end to end.
     AND payment_status <> 'refunded';

  IF v_max_participants IS NOT NULL AND v_current_count >= v_max_participants THEN
    RETURN jsonb_build_object('error', 'Evenimentul este complet.');
  END IF;

  INSERT INTO registrations (event_id, full_name, email, phone, payment_status)
  VALUES (p_event_id, p_full_name, p_email, p_phone, p_payment_status)
  RETURNING id INTO v_registration_id;

  RETURN jsonb_build_object('success', true, 'id', v_registration_id);
END;
$$;

-- Only the server-side key may call this. The public website reaches it through
-- /api/register, which is where the CAPTCHA and the input validation live —
-- letting the browser call it directly would skip both.
REVOKE ALL ON FUNCTION register_for_event(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION register_for_event(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
