-- ============================================================================
-- Give waiting-list claim links an actual expiry
-- ============================================================================
--
-- THE PROBLEM
--
-- The design said a claim link is valid for 24 hours. The database recorded an
-- `expires_at` on every notification batch. The email told people they had 24
-- hours. And nothing anywhere ever checked it.
--
-- /api/register/claim-spot looked the entry up by id and, if it had not already
-- been claimed, handed over a seat. A link mailed out in January still worked
-- in August.
--
-- WHY IT COULD NOT BE CHECKED
--
-- `waiting_list_notifications` recorded that a batch went out for an event, but
-- nothing connected a batch to the individual people in it. Given a claim token
-- there was no way to answer "which notification was this, and has it expired?"
-- The expiry was recorded against a row nobody could join back to.
--
-- THE FIX
--
-- Put the two facts on the waiting-list entry itself, where the claim route can
-- see them without a join. `waiting_list_notifications` stays as an audit log
-- of what was sent when.
--
-- A note on what expiry does and does not mean here: letting a link lapse does
-- not destroy the seat. Once someone is refunded or their checkout expires, the
-- seat is genuinely free and the event shows as bookable again to everybody.
-- The notification is a courtesy head start, not a reservation — so an
-- unclaimed link costs nobody anything.
-- ============================================================================

alter table public.waiting_list
  add column if not exists notified_at       timestamptz,
  add column if not exists claim_expires_at  timestamptz;

comment on column public.waiting_list.notified_at is
  'When this person was emailed a claim link. NULL means never notified, so their id is not a valid claim token.';

comment on column public.waiting_list.claim_expires_at is
  'Deadline for using the claim link. Checked by /api/register/claim-spot.';

-- Claims look entries up by id (the primary key, already indexed) and then test
-- these two columns, so no extra index is needed for the lookup itself. This
-- one supports the admin view of who is still waiting on a given event.
create index if not exists idx_waiting_list_event_unclaimed
  on public.waiting_list (event_id, claimed_at, created_at);
