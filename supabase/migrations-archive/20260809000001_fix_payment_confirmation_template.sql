-- ============================================================================
-- The payment confirmation email was missing everything it promised
-- ============================================================================
--
-- Found by making a real test payment against production and reading the email
-- that arrived. The seeded `payment_confirmation` body was:
--
--   <h2>Salut {{user_name}}!</h2>
--   <p>Plata pentru <strong>{{event_name}}</strong> a fost confirmată.</p>
--   <p>În fișierul atașat găsești invitația în calendar și linkul către
--      grupul de WhatsApp.</p>
--
-- Two problems.
--
-- It contains no {{whatsapp_link}} placeholder at all, so the link is never
-- rendered — and the sentence claiming it is "in the attached file" is untrue:
-- the .ics carries a title, description, time and location, and nothing else.
-- The email promised something it could not deliver.
--
-- It also omits the date, time and location that `registration_confirmation`
-- includes. So somebody who PAID received strictly less information than
-- somebody who booked a free event, which is backwards.
--
-- This is pre-existing — the template has been in the schema since the first
-- migration — but it only became reachable when the paid flow started sending
-- from the Stripe webhook rather than at registration. Until then no code path
-- ever used it.
--
-- The WHERE clause guards against overwriting the instructor's own edits: the
-- update only applies if the body is still exactly the original seeded text.
-- These templates are editable from /admin/emails, and a migration should never
-- silently discard something she wrote.
-- ============================================================================

update public.email_templates
set
  body_ro = '<h2>Salut {{user_name}}!</h2>'
    || '<p>Plata pentru <strong>{{event_name}}</strong> a fost confirmată. Ne vedem acolo!</p>'
    || '<p><strong>Data:</strong> {{event_date}}<br>'
    || '<strong>Ora:</strong> {{event_time}}<br>'
    || '<strong>Locație:</strong> {{event_location}}</p>'
    || '<p>Alătură-te grupului de WhatsApp: <a href="{{whatsapp_link}}">{{whatsapp_link}}</a></p>'
    || '<p>În fișierul atașat găsești invitația pentru calendar.</p>',
  body_en = '<h2>Hi {{user_name}}!</h2>'
    || '<p>Your payment for <strong>{{event_name}}</strong> is confirmed. See you there!</p>'
    || '<p><strong>Date:</strong> {{event_date}}<br>'
    || '<strong>Time:</strong> {{event_time}}<br>'
    || '<strong>Location:</strong> {{event_location}}</p>'
    || '<p>Join the WhatsApp group: <a href="{{whatsapp_link}}">{{whatsapp_link}}</a></p>'
    || '<p>The calendar invitation is attached.</p>',
  updated_at = now()
where type = 'payment_confirmation'
  and body_ro = '<h2>Salut {{user_name}}!</h2><p>Plata pentru <strong>{{event_name}}</strong> a fost confirmată.</p><p>În fișierul atașat găsești invitația în calendar și linkul către grupul de WhatsApp.</p>';
