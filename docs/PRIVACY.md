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
| Paying | nothing; the card goes to Stripe | Stripe confirms the payment |
| The contact form | name, email, message | to reply (legitimate interest) |
| Browsing | page views, without cookies | to see what is useful (legitimate interest) |

Phase 5 adds an optional note about health, with its own consent, and a
marketing opt-in. The privacy policy must gain both then.

## Cookies, and why there is no banner

EU law asks for consent only before *non-essential* cookies: analytics,
advertising and embedded social media. What the site sets:

- **NEXT_LOCALE**: remembers the language chosen. Necessary; deleted when the
  browser closes.
- **The admin's session**: only for her, when she signs in.
- **Statistics run without cookies.** Since 25 September 2026 PostHog keeps
  nothing in the visitor's browser (`persistence: "memory"` in
  `components/providers/posthog-provider.tsx`).

**One gap remains until phase 3:** videos embedded in blog posts (YouTube,
Vimeo, Instagram) load straight away, and those companies may set their own
cookies when they do. Phase 3 turns them into a still picture that loads the
video only when pressed, which is what makes "no banner" fully true.

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

- **Cancellation**: a full refund when cancelled at least 7 days before; later,
  no refund, but the place can be given to someone else. A full refund when she
  cancels.
- **How long bookings are kept**: 3 years from the event. Payment records: as
  long as accounting law requires.
- **Contact messages**: until the conversation ends, at most one year.

## What a lawyer should check

- The legal bases named for each use of data.
- The retention periods, against Romanian accounting law.
- The refund terms, against consumer law. The drafts rely on the exception for
  leisure services booked for a specific date (OUG 34/2014 art. 16 lit. l;
  Directive 2011/83/EU art. 16(l)), under which the 14-day right to withdraw
  does not apply.
- The health and photo paragraphs in the terms.
- Transfers outside the EEA: several processors are American companies, and
  PostHog currently sends statistics to its US host (phase 11 moves it to the
  EU).

## Other rules the site follows

- **ANSPDCP** is named in the privacy policy as the authority to complain to.
- **Promotional emails** (phase 7) go only to people who ticked an opt-in, with
  an unsubscribe link in every message (Law 506/2004, art. 12).
- **Reviews** (phase 6): the testimonials page will say every testimonial comes
  from a verified participant (the EU Omnibus directive).
- **The old SOL badge is not needed**: the EU platform behind it closed in July
  2025 and ANPC Order 270/2026 removed it. Only the SAL pictogram remains.

Sources:
- [ANPC Order 270/2026 (legislatie.just.ro)](https://legislatie.just.ro/Public/DetaliiDocumentAfis/310590)
- [ANPC announcement on SAL](https://anpc.ro/comunicat-sal/)
- [Law 506/2004 art. 12](https://legeaz.net/legea-506-2004-prelucrare-date-caracter-personal/articolul-12)
