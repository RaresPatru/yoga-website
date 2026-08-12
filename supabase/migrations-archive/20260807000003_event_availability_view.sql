-- ============================================================================
-- event_availability: public seat counts without exposing who booked
-- ============================================================================
--
-- THE BUG THIS FIXES
--
-- The website showed "0/15 locuri ocupate" on every event, forever, no matter
-- how many people had actually registered.
--
-- The pages counted seats by querying the registrations table straight from the
-- browser:
--
--     supabase.from("registrations")
--       .select("id", { count: "exact", head: true })
--       .eq("event_id", id)
--
-- But registrations contains names, emails and phone numbers, so its RLS policy
-- quite rightly allows only administrators to read it. A logged-out visitor is
-- not an administrator, so the query returned nothing.
--
-- And this is the part worth remembering: it did not return an error. Row Level
-- Security is a *filter*, not a lock — rows you may not see are simply absent.
-- The count came back 0, the code did `count || 0`, and everything carried on
-- looking healthy. A permissions failure disguised itself as "nobody has signed
-- up yet".
--
-- The knock-on effect was much larger than a wrong number. `isFull` is computed
-- from that count, so `isFull` was permanently false, so the "Locuri epuizate"
-- badge never appeared and the waiting-list form was unreachable. An entire
-- feature — the tables, the claim tokens, the notification emails, the admin
-- modal — sat there working perfectly and unreachable, because the number
-- feeding it was always zero. Someone trying to book a full event got a raw
-- error instead of being offered the waiting list.
--
-- THE FIX
--
-- Expose the count, and only the count. This view returns three numbers per
-- event and no personal data whatsoever, so it is safe for anyone to read.
-- ============================================================================

create or replace view public.event_availability as
select
  e.id                                as event_id,
  e.max_participants                  as capacity,
  count(r.id)                         as taken
from public.events e
left join public.registrations r
  on r.event_id = e.id
  -- Refunded people are not attending any more, so their seat is available.
  -- This condition deliberately matches register_for_event() exactly. When the
  -- displayed number and the enforced rule disagree, you get the worst kind of
  -- bug: a page that says "8/10 spots" next to a button that answers "sorry,
  -- this event is full".
  --
  -- Note that 'pending' IS counted. A pending row is somebody sitting in Stripe
  -- checkout right now, and they are holding that seat until they pay or their
  -- session expires (at which point the webhook deletes the row and offers the
  -- seat to the waiting list). The old client-side query excluded pending,
  -- which is why it could disagree with the capacity check.
  and r.payment_status <> 'refunded'
where e.published = true
group by e.id, e.max_participants;

-- ---------------------------------------------------------------------------
-- A note on how this view is allowed to see what the caller cannot
-- ---------------------------------------------------------------------------
-- By default a Postgres view runs with the privileges of whoever created it
-- (here: the postgres superuser), not of whoever queries it. That is normally
-- something to be careful about, and Supabase's linter warns about it — but it
-- is exactly the property we want here, and it is the reason this works at all.
-- The view can read registrations; the person querying it still cannot.
--
-- What makes that safe is that the view returns no row-level data. There is no
-- column here that could leak a name or an email: only an event id, a capacity
-- and a count. Aggregation is the boundary.
--
-- `security_invoker` is left off deliberately. Turning it on would make the
-- view run as the caller, RLS would filter the registrations away again, and we
-- would be back to counting zero.

grant select on public.event_availability to anon, authenticated;
