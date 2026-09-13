-- ============================================================================
-- Describe every object, in the database itself
-- ============================================================================
--
-- Postgres stores a description against a table, view, function or column, and
-- Supabase surfaces it in the Table Editor. `\d+` shows it locally. So this is
-- documentation that travels with the schema and cannot drift from it — unlike
-- a Markdown file, which can describe a column that was renamed last week.
--
-- These say what each object is FOR. The reasoning behind a decision that looks
-- strange lives in supabase/migrations-archive/, one migration per problem
-- solved; the broader map is docs/DATABASE.md.
--
-- THIS USED TO BE A LIVING FILE. IT IS NOT ANY MORE.
--
-- It was numbered 99999999999999 so it always sorted last, and was edited in
-- place whenever a table or column was added, then re-pasted into the SQL
-- editor. That worked while production had no migration ledger and every
-- migration was applied by hand: `comment on` is idempotent and
-- order-independent, so re-running it was free.
--
-- Two things ended that arrangement on 12 September 2026.
--
--   1. Production is now driven by `supabase db push`, which never re-applies a
--      migration it has already recorded. Editing this file would change
--      nothing on the live database — silently, which is the worst way for a
--      documentation file to fail.
--
--   2. The far-future version number made every *other* migration sort before
--      the last-applied one, so `db push` refused each of them with
--      `LegacyDbPushMissingRemoteError` until given `--include-all`. That flag
--      exists to override an ordering check, and needing it on every push turns
--      a real safety net into noise.
--
-- So it now carries an ordinary timestamp and behaves like any other migration.
-- **To describe a new object, write a new dated migration** — a file with two
-- `comment on` lines in it is a perfectly good migration, and the periodic fold
-- into the baseline will absorb it like the rest.
--
-- It is still excluded from that fold for now: the descriptions are easier to
-- read collected in one place than scattered through a baseline of a thousand
-- lines.
-- ============================================================================


comment on table public.profiles is
  'Extra fields on a Supabase auth account. Currently unused — the site has no public sign-up — but referenced by registrations.user_id and testimonials.user_id.';
comment on table public.events is
  'A class, workshop or retreat. The central table; registrations, testimonials and waiting-list entries all reference it.';
comment on table public.registrations is
  'One row per person signed up. Holds personal data, so admin-only. Created exclusively through register_for_event() via /api/register.';
comment on table public.blog_posts is
  'Articles. Readable publicly only when published = true and hidden is not true.';
comment on table public.testimonials is
  'Attendee feedback, shown once approved. Submitted through /api/testimonials with the service key and a CAPTCHA.';
comment on table public.contact_messages is
  'Private correspondence from the contact form. Admin-only in both directions.';
comment on table public.email_templates is
  'Bodies of the transactional emails, editable from /admin/emails. One row per type; {{placeholders}} are substituted by lib/email.ts.';
comment on table public.waiting_list is
  'People waiting for a seat on a full event. The row id doubles as the claim token.';
comment on table public.waiting_list_notifications is
  'Audit log of which batch was emailed for which event. Written by the Stripe webhook; read only to compute the next batch_number.';
comment on table public.site_content is
  'Key/value store for page copy the instructor edits herself. Expected keys are declared in lib/site-content.ts.';
comment on table public.faqs is
  'Frequently asked questions shown on the events page, ordered by sort_order.';
comment on table public.whatsapp_links is
  'Reusable WhatsApp invite URLs the instructor picks from when creating an event. Admin-only for reading too: an invite URL is a capability.';
comment on table public.admins is
  'The list of accounts allowed into /admin. Read only by is_admin(); revoked from anon and authenticated.';

comment on view public.event_availability is
  'Public seat counts (event_id, capacity, taken) with no personal data. Runs with its creator''s privileges so it can read registrations that the caller cannot; aggregation is the privacy boundary.';

comment on function public.is_admin() is
  'True when the current request comes from an account listed in public.admins. Called by nearly every RLS policy.';
comment on function public.pending_hold_interval() is
  'How long an unpaid pending registration holds a seat (1 hour). Shared by event_availability and register_for_event so they cannot disagree.';
comment on function public.register_for_event(UUID, TEXT, TEXT, TEXT, TEXT) is
  'Capacity check and insert in one transaction, locking the event row with FOR UPDATE to prevent overbooking. service_role only.';

comment on column public.events.price is
  'Whole number in the major unit: 150 means 150 RON. Conversion to Stripe minor units happens in lib/money.ts.';
comment on column public.events.currency is
  'ISO 4217 code, one of RON, EUR, USD, GBP. Passed to Stripe at checkout.';
comment on column public.events.max_participants is
  'NULL means unlimited. Zero and negatives are rejected — a capacity of zero is indistinguishable from a full event.';
comment on column public.events.whatsapp_group_link is
  'Copied from whatsapp_links when the event is created, not referenced, so editing the library cannot change what past attendees were told.';
comment on column public.registrations.payment_status is
  'free | pending | completed | refunded. Refunded frees the seat; pending holds it for pending_hold_interval().';
comment on column public.blog_posts.hidden is
  'Pulls a post from the site without unpublishing it. The read policy checks this as well as published.';
comment on column public.testimonials.rating is
  'Optional 1-5 rating. NULL means unrated — render no stars rather than assuming five.';
comment on column public.testimonials.author_name is
  'Who gave the testimonial. Optional; falls back to an anonymous label.';
comment on column public.testimonials.video_url is
  'Video file or embed URL, used when type = ''video''.';
comment on column public.waiting_list.notified_at is
  'When this person was emailed a claim link. NULL means never notified, so their id is not a valid claim token.';
comment on column public.waiting_list.claim_expires_at is
  'Deadline for using the claim link. Checked by /api/register/claim-spot.';
comment on column public.site_content.field_type is
  'Chooses the admin editor: text (input), richtext (textarea), image (media picker).';
comment on column public.whatsapp_links.is_default is
  'Preselected on a new event. At most one row may be true, enforced by the partial unique index whatsapp_links_single_default.';
