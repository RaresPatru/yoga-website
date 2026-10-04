# Privacy, cookies and terms

What the site's three legal pages say, what she still has to fill in, and
what a lawyer should check before launch. Written 25 September 2026 with the
drafts in `supabase/migrations/20260925000000_faq_hidden_and_legal_drafts.sql`.
**None of this is legal advice.**

The documents are edited in the admin: **Conținut site → Pagini legale**. They
appear at `/privacy`, `/terms` and `/cookies`, in both languages, linked from
every page's footer. Each shows the date it was last saved.

---

## Who is responsible for what

- **She is the "data controller"**: the business that decides why personal
  data is collected.
- **Her "processors"** handle data for her: Supabase (the database), Vercel
  (hosting), Stripe (payments), Resend (email), Cloudflare (spam protection on
  the forms) and PostHog (visitor statistics). The privacy policy names them.

## What the site collects today

| When | What | Why (legal basis) |
|---|---|---|
| Booking an event | name, email, phone | to hold the place and send the details (contract) |
| Joining a waiting list | name, email, phone | to offer a freed place (contract) |
| Either form, if they write one | a note, often about health | so she knows at the event (explicit consent, a separate tick) |
| Either form, if they tick it | the wish to hear about future events | announcements (consent) |
| Receiving an announcement | the address, name and language it went to, and whether it arrived | the history of what was sent (as long as bookings) |
| Unsubscribing | the address, and when | so nobody is written to again (legitimate interest; kept while announcements are sent) |
| Paying | nothing; the card goes to Stripe | Stripe confirms the payment |
| Writing a testimonial | the text, rating, chosen name, and a photo or video link if added | published with their consent, once she approves it (consent) |
| The contact form | name, email, message | to reply (legitimate interest) |
| Browsing | page views, where a visit came from, device and browser, country and city from the IP address, booking steps without anyone's details, posts read to the end; no cookies, nothing stored in the browser | to see what is useful (legitimate interest) |

Since phase 5 (26 September 2026) the forms ask for both, and the policy
draft says so: `20260928000000_participants.sql` added its paragraphs where
the draft still had its original sentences. Notes, hers included, are deleted
30 days after the event by the daily job.

## Cookies, and why there is no banner

EU law asks for consent only before *non-essential* cookies: analytics,
advertising and embedded social media. What the site sets:

- **NEXT_LOCALE**: remembers the language chosen. Necessary; deleted when the
  browser closes.
- **The admin's session**: only for her, when she signs in.
- **Statistics run without cookies.** Since 25 September 2026 PostHog keeps
  nothing in the visitor's browser (`persistence: "memory"` in
  `components/providers/analytics.tsx`), checked in a browser since phase 11
  (`tests/analytics.spec.ts`). Since then (4 October 2026) they also go only
  to PostHog's EU cloud, come only from the site's public address, leave out
  her own visits, previews, pages behind a personal link and browsers that
  send Global Privacy Control or Do Not Track, and record no screens, clicks
  or form contents ([DECISIONS.md](DECISIONS.md#visitor-statistics)). The
  privacy policy draft says what they collect, why and for how long
  (`20261004000000_statistics_privacy.sql`).

- **Videos in posts and event descriptions** (YouTube, Vimeo, Instagram,
  TikTok) load only when a visitor presses play. Until then the page shows a
  placeholder that says so, and contacts none of those companies: no
  thumbnail is fetched either. YouTube plays from its no-cookie host. Since
  26 September 2026 (phase 3) this is what makes "no banner" true; before, the
  videos loaded with the page.

Pressing play is the visitor asking for the video, after which the video
site's own terms apply. The cookie policy should say that in a sentence.

## What she has to fill in

Under **Conținut site → Pagini legale → Datele firmei**. Until each one is
filled in, the pages show a dashed marker in its place.

- **Denumirea și forma juridică**, exactly as registered (for example "Nume
  Prenume PFA").
- **CUI**.
- **Sediul**, the registered address.
- **Email pentru date personale**, where people ask to see or delete their data.
- **TVA**: whether she is VAT registered. The terms then say whether prices
  include VAT.
- **Pictograma ANPC SAL**: the official 250×50 image from
  [anpc.ro/comunicat-sal](https://anpc.ro/comunicat-sal/). Until it is
  uploaded, the footer has a text link to reclamatiisal.anpc.ro instead.

## Defaults in the drafts that she must confirm

These are suggestions written into the text. They are hers to change, and
they are business decisions rather than facts:

- **Cancellation**: since phase 10 (3 October 2026), Rares' assumptions until
  she confirms them: an automatic full refund up to 48 hours before the start;
  later, the place is freed and the refund is her decision; refunds are only
  ever full, and a full refund when she cancels. They live in
  `lib/cancel-rules.ts` and in the terms draft. (The first draft said 7 days.)
- **How long bookings are kept**: 3 years from the event. Waiting lists the
  same since phase 5 (the draft first said until the event ends, but the
  admin archive keeps them). Nothing deletes old bookings yet; once she
  confirms a period, the daily job can. Payment records: as
  long as accounting law requires.
- **Contact messages**: until the conversation ends, at most one year.
  Nothing deletes them yet: a message stays in Mesaje, archived or not, until
  she deletes it (phase 8). Once she confirms a period, the daily job can
  delete older ones.

## What a lawyer should check

- The legal bases named for each use of data.
- The retention periods, against Romanian accounting law.
- The refund terms, against consumer law. The drafts rely on the exception for
  leisure services booked for a specific date (OUG 34/2014 art. 16 lit. l;
  Directive 2011/83/EU art. 16(l)), under which the 14-day right to withdraw
  does not apply.
- The health and photo paragraphs in the terms.
- Transfers outside the EEA: several processors are American companies.
  PostHog keeps the statistics on its EU cloud (Frankfurt) since phase 11, and
  its project was on the EU cloud already.
- **Statistics without a banner.** The site asks no consent for them because
  nothing is stored on or read back from the visitor's device beyond what the
  page itself needs, and the legal basis is legitimate interest. That is the
  usual reading of the ePrivacy rule (Law 506/2004 art. 4(5) in Romania), but
  the EDPB's Guidelines 2/2023 read "gaining access to the device" broadly
  enough to take in any script that collects details from the browser, which
  would need consent. A lawyer should say which reading Romania follows; the
  alternative is a consent banner (audit C2).
- **PostHog's data processing agreement.** GDPR art. 28 requires a contract
  with each processor. PostHog's is self-serve on any plan, signed in the
  business's name from its legal page.

## Other rules the site follows

- **ANSPDCP** is named in the privacy policy as the authority to complain to.
- **Promotional emails** go only to people who ticked an opt-in, with an
  unsubscribe link in every message (Law 506/2004, art. 12). Since phase 7
  (28 September 2026) that is announcements: an address is included only if
  its latest opt-in, on any booking, is newer than any unsubscribe. Every
  announcement carries one-click unsubscribe headers (RFC 8058) as well as the
  link, and the link's page changes nothing until its button is pressed.
  Unsubscribed addresses stay on `email_suppressions`; the policy draft says
  so (`20260930000000_email_system.sql`).
- **Someone who asks another way** (a message, in person) to stop receiving
  announcements: she presses "Oprește anunțurile" in their panel in
  Înscrieri, which suppresses the address the same way.
- **Erasure requests** reach the announcement history too: deleting a person
  from Înscrieri does not delete the announcements they received. Deleting an
  announcement from the history deletes its list of recipients; the
  suppression list is kept, so an erased address is not written to again.
- **Reviews** (phase 6): the testimonials page will say every testimonial comes
  from a verified participant (the EU Omnibus directive).
- **The old SOL badge is not needed**: the EU platform behind it closed in July
  2025 and ANPC Order 270/2026 removed it. Only the SAL pictogram remains.

Sources:
- [ANPC Order 270/2026 (legislatie.just.ro)](https://legislatie.just.ro/Public/DetaliiDocumentAfis/310590)
- [ANPC announcement on SAL](https://anpc.ro/comunicat-sal/)
- [Law 506/2004 art. 12](https://legeaz.net/legea-506-2004-prelucrare-date-caracter-personal/articolul-12)
