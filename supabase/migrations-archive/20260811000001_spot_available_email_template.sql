-- ============================================================================
-- The waiting-list email had nowhere to come from
-- ============================================================================
--
-- THE PROBLEM
--
-- When a seat frees up, the Stripe webhook picks the next batch off the waiting
-- list, stamps a claim window onto each entry, and then looks up the email to
-- send them:
--
--     .from("email_templates").select("subject_ro, body_ro")
--     .eq("type", "spot_available").maybeSingle()
--
--     if (!template) {
--       console.error("No 'spot_available' email template; claim links were not sent.");
--       return;
--     }
--
-- There is no such template, and there never could be. `email_templates.type`
-- carries a CHECK constraint listing three values, and 'spot_available' is not
-- among them:
--
--     check (type in ('registration_confirmation', 'payment_confirmation',
--                     'testimonial_request'))
--
-- So the insert was impossible, the lookup always returned nothing, and the
-- webhook took the early return every time. Everything up to that point worked:
-- the seat was released, the batch was chosen, `notified_at` and
-- `claim_expires_at` were written, and a row went into
-- `waiting_list_notifications` saying the batch had been notified. The only
-- thing that never happened was the email.
--
-- The failure is quiet in the worst way. The audit log says people were told;
-- their claim windows tick down and expire; and the seat eventually reopens to
-- the general public while the people who asked for it first are still waiting
-- to hear. Nothing errors, and the only trace is one console.error in the
-- webhook's logs.
--
-- THE FIX
--
-- Widen the constraint and seed the template. Constraint first, or the insert
-- below is rejected by the version still in force.
--
-- Found while consolidating the schema: the type appears in the application but
-- in neither the constraint nor the seed, which is the kind of mismatch that
-- only shows up when you read the two side by side.
-- ============================================================================

alter table public.email_templates
  drop constraint if exists email_templates_type_check;

alter table public.email_templates
  add constraint email_templates_type_check
  check (type in (
    'registration_confirmation',
    'payment_confirmation',
    'testimonial_request',
    'spot_available'
  ));


-- The placeholders are the ones the webhook actually substitutes — user_name,
-- event_name, claim_url and expires_at. Anything else renders literally.
--
-- `expires_at` arrives already formatted in Romania's timezone rather than the
-- server's, so the time in the email is the time the claim route enforces.
--
-- `on conflict do nothing` so re-running this cannot overwrite wording the
-- instructor has since edited from /admin/emails.
insert into public.email_templates (type, subject_ro, body_ro, subject_en, body_en) values
('spot_available',
 'S-a eliberat un loc - {{event_name}}',
 '<h2>Salut {{user_name}}!</h2>'
 || '<p>S-a eliberat un loc la <strong>{{event_name}}</strong> și îți revine ție primul.</p>'
 || '<p><a href="{{claim_url}}">Rezervă-ți locul</a></p>'
 || '<p>Linkul este valabil până la {{expires_at}}. După această oră locul devine disponibil pentru toată lumea.</p>',
 'A spot opened up - {{event_name}}',
 '<h2>Hi {{user_name}}!</h2>'
 || '<p>A spot has opened up for <strong>{{event_name}}</strong>, and you are first in line.</p>'
 || '<p><a href="{{claim_url}}">Claim your spot</a></p>'
 || '<p>This link is valid until {{expires_at}}. After that the spot is offered to everyone.</p>')
on conflict (type) do nothing;
