CREATE OR REPLACE FUNCTION register_for_event(
  p_event_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_payment_status TEXT DEFAULT 'free'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_participants INTEGER;
  v_current_count INTEGER;
  v_registration_id UUID;
BEGIN
  SELECT max_participants INTO v_max_participants
  FROM events WHERE id = p_event_id FOR UPDATE;

  SELECT COUNT(*) INTO v_current_count
  FROM registrations WHERE event_id = p_event_id;

  IF v_max_participants IS NOT NULL AND v_current_count >= v_max_participants THEN
    RETURN jsonb_build_object('error', 'Evenimentul este complet.');
  END IF;

  INSERT INTO registrations (event_id, full_name, email, phone, payment_status)
  VALUES (p_event_id, p_full_name, p_email, p_phone, p_payment_status)
  RETURNING id INTO v_registration_id;

  RETURN jsonb_build_object('success', true, 'id', v_registration_id);
END;
$$;
