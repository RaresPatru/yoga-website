-- ===========================================================================
-- The admin dashboard's numbers
-- ===========================================================================
--
-- What this adds: two views the dashboard reads.
--
--   admin_event_overview  One row per event with what is waiting on it:
--
--     waiting            People on its waiting list who are still in line:
--                        not yet booked, and not holding a live claim link.
--                        Someone whose link lapsed is back in line.
--     pending_payments   Bookings waiting for payment. Only a paid event has
--                        them, and only the ones still inside the hold window
--                        count (the same window that decides whether one holds
--                        a seat), so an abandoned checkout stops counting after
--                        an hour. Free bookings never count.
--
--   admin_dashboard       One row with the five counts at the top of the
--                         dashboard, following the rules Rares set on
--                         24 September 2026:
--
--     active_events          Published events that have not ended yet, full or
--                            not. An event drops out the moment its ends_at
--                            passes, so the number goes down by itself.
--     pending_payments       The pending_payments above, summed over every
--                            event, so the rule is written once.
--     draft_posts            Blog posts not yet published.
--     unread_messages        Contact messages she has not opened and not
--                            archived.
--     pending_testimonials   Testimonials waiting for her approval.
--
-- Who can read them: `security_invoker` makes a view run with the permissions
-- of whoever asks, so the admin-only row policies on the tables underneath
-- still apply. Anyone who is not the admin sees only what the public already
-- can (published events), and zero for everything else. Visitors (anon) have
-- no grant at all, and tests/rpc-exposure.spec.ts fails if one appears.

-- ---------------------------------------------------------------------------
-- 1. Per event
-- ---------------------------------------------------------------------------
create view public.admin_event_overview
with (security_invoker = true)
as
select
  e.id as event_id,
  (select count(*) from public.waiting_list w
    where w.event_id = e.id
      and w.claimed_at is null
      and (w.claim_expires_at is null or w.claim_expires_at <= now()))::int as waiting,
  (select count(*) from public.registrations r
    where r.event_id = e.id
      and r.payment_status = 'pending'
      and r.created_at > now() - public.pending_hold_interval())::int as pending_payments
from public.events e;

-- Stated in full rather than inherited: a new view picks up different default
-- privileges locally and in production (see CLAUDE.md).
revoke all on public.admin_event_overview from anon, authenticated, service_role;
grant select on public.admin_event_overview to authenticated;

comment on view public.admin_event_overview is
  'Per event: people still waiting in line (no live claim link) and bookings awaiting payment inside the hold window. security_invoker, admin-only through the underlying policies.';

-- ---------------------------------------------------------------------------
-- 2. The five counts
-- ---------------------------------------------------------------------------
create view public.admin_dashboard
with (security_invoker = true)
as
select
  (select count(*) from public.events e
    where e.published and e.ends_at > now())::int as active_events,
  (select coalesce(sum(o.pending_payments), 0)
     from public.admin_event_overview o)::int as pending_payments,
  (select count(*) from public.blog_posts p
    where not p.published)::int as draft_posts,
  (select count(*) from public.contact_messages m
    where m.read_at is null and m.archived_at is null)::int as unread_messages,
  (select count(*) from public.testimonials t
    where not t.approved)::int as pending_testimonials;

revoke all on public.admin_dashboard from anon, authenticated, service_role;
grant select on public.admin_dashboard to authenticated;

comment on view public.admin_dashboard is
  'One row of counts for the admin dashboard: active events, live pending payments, draft posts, unread messages, testimonials awaiting approval. security_invoker, admin-only through the underlying policies.';
