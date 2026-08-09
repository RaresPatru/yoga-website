# Plan

What is left to do. Forward-looking only.

> **A phase is "complete" only when a test proves it.**
>
> This rule exists because of what the previous version of this file claimed.
> Phase 6 was marked complete while the waiting list was unreachable in
> production — the capacity counter it depended on always read zero. Phase 8
> claimed the calendar-invite timezone was fixed; every invite was still three
> hours out. The file also referenced an API route that had never existed.
>
> Nothing here is ticked because it was written. It is ticked because something
> fails if it breaks.

**History lives elsewhere.** What was wrong and how it was fixed is in
[docs/JOURNEY.md](docs/JOURNEY.md). Why things are built the way they are is in
[docs/DECISIONS.md](docs/DECISIONS.md).

---

## Status

| | |
|---|---|
| Tests | 148 passing, 1 skipped |
| Critical vulnerabilities | 0 open |
| Deployed | production is public; preview deployments require Vercel login |
| Blocking launch | real content from the instructor |

---

## Before launch

### Content — the actual blocker

Nothing technical is stopping this site going live. What is missing is her: no
photograph, no bio, no About text, no FAQs, and the business is still called
"Yoga Flow".

Full prioritised list: [docs/CONTENT-NEEDED.md](docs/CONTENT-NEEDED.md).
She fills it in herself at `/admin/content` — no developer needed.

- [ ] Photograph, intro, and About story (the three that matter most)
- [ ] A real business name → one line in `lib/site-config.ts`
- [ ] 4–5 FAQs
- [ ] Instagram and email links for the footer (currently `#`)

### Verification that has never run against production

- [ ] **One real Stripe test payment, end to end.** The confirmation email now
      sends from the webhook rather than at registration, and that path has
      never executed in production.
- [ ] Confirm the Stripe webhook endpoint points at the production domain.
- [ ] Check the site in Instagram's in-app browser on a real iPhone. WebKit is
      covered by the test suite; the webview itself is not.

---

## Next

### Share images should use the brand typeface

The generated Open Graph and story images render in a system sans. Fraunces needs
loading into Satori as font data. Cosmetic, but these images are the first thing
anyone sees of the site.

### Re-notify a waiting list that goes quiet

If the first person does not use their 24-hour claim link, nobody else is
contacted automatically. The seat is not lost — the event simply becomes bookable
again — but the next person on the list is never told. Wants either a scheduled
job or a "notify next" button in the admin waiting-list modal.

### Rate limiting that survives serverless

Currently per-instance and in-memory, which is documented but weak. Vercel KV or
Upstash if abuse ever becomes real. Not urgent while the CAPTCHA holds.

### Testimonial requests

An email template exists (`testimonial_request`) and nothing sends it. Obvious
follow-up: a button on a past event that emails attendees asking for one —
ideally video, which is the highest-converting format.

---

## Someday

- Google Business Profile, then a reviews embed. Needs an established profile
  first.
- Per-event duration. Calendar invites currently assume 90 minutes.
- Admin dashboard revenue figures.
- Instagram feed on the home page.

---

## Working agreements

- **Migrations, never dashboard SQL.** Applying schema changes by hand is why
  the database could not be rebuilt from this repository, and why two features
  shipped broken with `permission denied`.
- **Tests never touch production.** `tests/helpers.ts` refuses to run against a
  non-local database.
- **Comment the reasoning, not the syntax.** Especially in SQL and API routes —
  the point is that this is readable months later by someone who is not a
  backend specialist.
- **State limitations in the code.** The rate limiter says it is per-instance.
  The availability view explains why it can read what the caller cannot.
