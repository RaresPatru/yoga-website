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
| Tests | 186 passing, 6 skipped |
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

## Before the next deploy

- [x] **Seed the `spot_available` email template.** Applied to
      production 12 August 2026. The Stripe webhook looks up an
      `email_templates` row of type `spot_available` to email the waiting list
      when a seat frees up, but the `type` CHECK constraint never listed that
      value, so the row could not exist and the lookup always came back empty.
      Everything around it worked — the seat was released, the batch chosen,
      claim windows written, and the audit log recorded that people had been
      notified. The only thing that never happened was the email.

- [x] **Confirm production matches the baseline.** Done 12 August 2026, by
      diffing a linked `db dump` against a local one. Every table, column,
      constraint, index, grant and policy matched except two things, both since
      fixed: three RLS policies that existed only in production, and the object
      descriptions. `supabase_migrations.schema_migrations` does not exist in
      production, which confirms the CLI has never driven it — there is no
      migration ledger to repair, and `db push` must never be run against it.

- [x] **Drop three stale waiting-list policies.** Applied 12 August 2026. They
      existed in production and in no migration: the August hardening ran
      `drop policy if exists` against the names used in the repo, while
      production had been built from a dashboard paste using different lowercase
      names, so it matched nothing and reported success.
      `"authenticated can read waiting_list" ... using (true)` meant any
      logged-in account could read every waiting-list row — name, email, phone —
      regardless of `is_admin()`.

- [x] **Describe every object.** Applied 12 August 2026. The Supabase Table
      Editor now shows what each table and column is for. Maintained in
      `supabase/migrations/99999999999999_object_comments.sql`, which is edited
      in place rather than superseded — re-paste it after each edit.

- [x] **Close the `register_for_event` exposure.** Applied 12 August 2026.
      Anyone holding the publishable key — which ships in the site's JavaScript
      — could call `/rest/v1/rpc/register_for_event` directly: no CAPTCHA, no
      rate limit, no validation, and `p_payment_status => 'completed'` booked a
      paid event without paying. Reproduced locally before fixing: a 350 RON
      retreat, marked paid, no payment.

      `revoke ... from anon, authenticated` looked like it closed this and did
      not. Postgres grants EXECUTE to `PUBLIC` at creation, and revoking named
      roles leaves that inherited grant in place; `pg_dump` omits default PUBLIC
      grants, so the schema dump looked correct. Confirmed gone from the Supabase
      advisor panel. Regression covered by `tests/rpc-exposure.spec.ts`.

- [x] **Advisor policy tuning.** Applied 12 August 2026. Anonymous listing of
      the media bucket closed, `auth.uid()` evaluated once per query, and the
      eleven admin policies scoped to `to authenticated`. The
      `multiple_permissive_policies` findings dropped from ~24 to 5, and the
      `auth_rls_initplan` findings are gone.

- **Not actionable — leaked-password protection needs a paid plan.** The advisor
      reports it as a warning, and it stays there: the setting lives under
      Authentication → Sign In / Providers → Email, and Supabase gates it behind
      the Pro plan. This project is on Free.

      It is a check against HaveIBeenPwned at sign-in and password-change, so
      what it actually prevents is *choosing* a password that already appears in
      a public breach corpus. With one account and a deliberate rotation, the
      same protection is available by hand: paste the candidate into
      <https://haveibeenpwned.com/Passwords> before setting it. Same corpus,
      same k-anonymity model, no plan required.

      So the advisor panel now has two permanent residents — this and
      `security_definer_view`. Both are understood; neither is neglect. The rest
      is documented in
      `migrations-archive/20260812000004_advisor_policy_tuning.sql`.

- [ ] **Rotate the admin password.** It was sitting in plaintext in
      `ProductionQuery.SQL` on disk (since redacted, and the file is
      gitignored). Never committed — verified with `git log --all -S`. Deferred
      deliberately: it is currently in use for testing, and the account is the
      only one on the project.

## Paused

### The floating "book now" bar

Built, tested and switched off at the owner's request — one commented-out
`<StickyCta />` in `app/[locale]/page.tsx`. The component, the `#hero-cta-end`
marker and its two Playwright tests are intact; uncommenting the line and
changing `test.describe.skip` back to `test.describe` restores it.

## Next

### Share images should use the brand typeface

The generated Open Graph and story images render in a system sans. Playfair
Display needs loading into Satori as font data. Cosmetic, but these images are
the first thing anyone sees of the site.

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
