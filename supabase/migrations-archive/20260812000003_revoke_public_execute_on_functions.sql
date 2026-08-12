-- ============================================================================
-- register_for_event was callable by anyone. Apply this one first.
-- ============================================================================
--
-- THE HOLE
--
-- `register_for_event()` is SECURITY DEFINER and is the only thing that writes
-- to `registrations`. The website reaches it through /api/register, which is
-- where the Turnstile CAPTCHA, the rate limiter and the input validation live.
-- Letting a browser call it directly skips all three, so the previous migration
-- was written to prevent exactly that:
--
--   revoke all on function public.register_for_event(...) from anon, authenticated;
--   grant execute on function public.register_for_event(...) to service_role;
--
-- That did not do what it looks like it does. When Postgres creates a function
-- it grants EXECUTE to `PUBLIC` — the implicit group every role belongs to.
-- Revoking from `anon` and `authenticated` by name removes their *explicit*
-- grants and leaves the PUBLIC one untouched, so both roles still had EXECUTE,
-- inherited. The ACL tells the story once you know to look:
--
--   register_for_event | =X/postgres | postgres=X/postgres | service_role=X/postgres
--                        ^^^^^^^^^^^ empty grantee means PUBLIC
--
-- `pg_dump` does not print default PUBLIC grants, so the schema dump showed
-- only the service_role line and looked correct. Supabase's linter is what
-- surfaced it, reporting the function as executable via /rest/v1/rpc/ by both
-- `anon` and `authenticated`.
--
-- WHAT IT ALLOWED
--
-- Anyone holding the publishable key — which is public by design and sits in
-- the site's JavaScript — could POST to /rest/v1/rpc/register_for_event and:
--
--   * book seats with no CAPTCHA and no rate limit, filling an event with
--     fabricated registrations;
--   * pass p_payment_status => 'completed' and be recorded as having paid for
--     a paid event. The function validates that the status is one of four
--     permitted values, and 'completed' is one of them.
--
-- Confirmed against a local database rather than inferred: `set role anon`
-- followed by a call booked a 350 RON retreat, marked completed, no payment.
--
-- THE FIX
--
-- Revoke from PUBLIC, which is the grant that actually existed, then re-grant
-- to service_role explicitly. `revoke ... from public` does not touch the
-- role-specific grants, so the service_role line below is what keeps
-- /api/register working; without it this migration would take the booking flow
-- down entirely.
-- ============================================================================

revoke all on function public.register_for_event(UUID, TEXT, TEXT, TEXT, TEXT)
  from public;
revoke all on function public.register_for_event(UUID, TEXT, TEXT, TEXT, TEXT)
  from anon, authenticated;

grant execute on function public.register_for_event(UUID, TEXT, TEXT, TEXT, TEXT)
  to service_role;


-- ---------------------------------------------------------------------------
-- The same implicit grant on the other two functions
-- ---------------------------------------------------------------------------
-- Neither is a hole, but both carry the same inherited PUBLIC grant, and an ACL
-- that says what it means is worth having when the next person reads it.
--
-- `is_admin()` returns false for anyone not in the admins table, so calling it
-- anonymously reveals nothing. It stays granted to anon and authenticated
-- because RLS policy expressions are evaluated with the *caller's* privileges:
-- revoking it would make every public page fail with "permission denied for
-- function is_admin" the moment a policy referencing it is checked.
--
-- `pending_hold_interval()` returns a constant.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

revoke all on function public.pending_hold_interval() from public;
grant execute on function public.pending_hold_interval()
  to anon, authenticated, service_role;
