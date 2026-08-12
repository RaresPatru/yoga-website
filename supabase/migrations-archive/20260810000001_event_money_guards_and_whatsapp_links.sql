-- ============================================================================
-- Money you cannot get wrong, a currency, and a WhatsApp link she types once
-- ============================================================================
--
-- Three related changes to how an event is priced and published.
--
-- WHY THE CONSTRAINTS BELONG HERE AND NOT IN THE FORM
--
-- The admin panel writes to Supabase straight from the browser — there is no
-- API route in between — so a `min="0"` on the input is a hint to the person
-- typing, not a rule. Anyone holding an admin session can send whatever they
-- like to PostgREST. A negative price would then reach Stripe as a negative
-- `unit_amount`, and a negative capacity would make `taken >= max_participants`
-- true for every event, marking the whole calendar sold out.
--
-- Both are the same mistake the audit found in the registration route: trusting
-- the client for a number that decides money. The database is the only place
-- that sees every write, so the check goes there. The form gets `min` as well,
-- because a constraint violation is a bad way to learn you typed a minus sign.
-- ============================================================================

alter table public.events
  drop constraint if exists events_price_non_negative;
alter table public.events
  add constraint events_price_non_negative check (price >= 0);

-- Existing rows are repaired before the constraint is added.
--
-- This is not hypothetical tidiness: adding the constraint failed on the first
-- attempt against production, because a test event had been saved with
-- max_participants = -2 back when the form still allowed it. A CHECK is
-- validated against every existing row, which makes this the first migration
-- here that can fail on *data* rather than on schema — worth remembering, since
-- "apply the migration, then deploy" had never before carried a risk of the
-- first step not working.
--
-- Repaired to NULL rather than to some invented number. NULL means "no limit",
-- which is what an admin who left the field blank would have got, and inventing
-- a capacity would be asserting something nobody said. The alternative —
-- deleting the offending rows — is not something a migration should do quietly.
--
-- Worth knowing if you are restoring a production dump locally: a negative
-- capacity currently reads as *permanently sold out*, because
-- `taken >= max_participants` is true for every value of taken. Repairing it to
-- NULL therefore reopens booking on that event. That was right here, where the
-- row was a test event, but check the rows before running this against a
-- database whose history you do not know.
update public.events
   set max_participants = null
 where max_participants is not null
   and max_participants <= 0;

-- NULL means "no limit", which is why this is not simply `> 0`. Zero is
-- rejected rather than treated as unlimited: an event with a capacity of zero
-- is indistinguishable from a full one, and silently means nobody can book.
alter table public.events
  drop constraint if exists events_capacity_positive;
alter table public.events
  add constraint events_capacity_positive
  check (max_participants is null or max_participants > 0);


-- ---------------------------------------------------------------------------
-- Currency
-- ---------------------------------------------------------------------------
-- Prices were rendered as "150 RON" with the currency written into the markup
-- in eight different files, and the Stripe session hardcoded `currency: "ron"`.
-- She occasionally runs a retreat priced in euro, and the only way to express
-- that was to write the wrong number.
--
-- Stored as a column rather than a separate table: there are four options, they
-- change roughly never, and a lookup table would buy a join and nothing else.
-- The CHECK is what keeps it honest — Stripe rejects an unknown currency code
-- at checkout, which is the worst possible moment to find out.
--
-- Deliberately NOT a per-event minor-unit amount. `price` stays a whole-number
-- major unit (150 = 150 RON) because that is what the existing rows hold and
-- what the admin form shows; the conversion to Stripe's minor units stays in
-- one place, in the checkout route.
alter table public.events
  add column if not exists currency text not null default 'RON';

alter table public.events
  drop constraint if exists events_currency_supported;
alter table public.events
  add constraint events_currency_supported
  check (currency in ('RON', 'EUR', 'USD', 'GBP'));


-- ---------------------------------------------------------------------------
-- Saved WhatsApp group links
-- ---------------------------------------------------------------------------
-- The WhatsApp group link is pasted into every event by hand, and it is very
-- nearly always the same one. Retyping a 60-character invite URL for each event
-- is how you end up with a typo in the link that only the people who paid ever
-- see — and by then they have already been told to expect it in their
-- confirmation email.
--
-- So: a small library of named links she manages once, and picks from when
-- creating an event.
--
-- The event keeps its own `whatsapp_group_link` text column rather than
-- referencing a row here. That is intentional. The link is *copied* onto the
-- event at the moment it is chosen, so deleting a link from the library — or
-- editing it because the group changed — cannot rewrite history for events that
-- already went out with the old URL in their confirmation emails. The library
-- is a convenience for filling in a field, not the source of truth for what an
-- attendee was told.
create table if not exists public.whatsapp_links (
  id          uuid primary key default gen_random_uuid(),
  -- What she calls it: "Grup general", "Retreat Apuseni". Shown in the picker.
  label       text not null,
  url         text not null,
  -- One link can be marked as the one to preselect on a new event.
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- A WhatsApp invite is a capability: anyone holding the URL can join the group.
-- So unlike almost every other table here, this one is admin-only for reading
-- too — there is no "anyone can view" policy. The link still reaches attendees,
-- but through the event they registered for and the email they were sent, not
-- by being listed publicly.
alter table public.whatsapp_links enable row level security;

drop policy if exists "Admins can manage whatsapp links" on public.whatsapp_links;
create policy "Admins can manage whatsapp links"
  on public.whatsapp_links for all
  using (public.is_admin())
  with check (public.is_admin());

-- Declared alongside the policy on purpose. Postgres checks the GRANT and the
-- RLS policy separately, and a missing grant has shipped a broken feature here
-- twice — the symptom is an empty list with no error, because RLS filters
-- rather than refuses.
grant select, insert, update, delete on public.whatsapp_links to authenticated;
grant select, insert, update, delete on public.whatsapp_links to service_role;

-- At most one default, enforced by a partial unique index rather than a trigger.
-- Setting a new default is then "clear the old one, set the new one" in the
-- admin panel; getting it wrong fails loudly instead of leaving two defaults
-- and a picker that has to guess.
create unique index if not exists whatsapp_links_single_default
  on public.whatsapp_links (is_default)
  where is_default;
