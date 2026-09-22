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
| Tests | 392 passing, 11 skipped (22 September 2026, local, one worker) |
| Critical vulnerabilities | 0 open |
| Deployed | production is public; preview deployments require Vercel login |
| Blocking launch | real content from the instructor |

---

## Before launch

### Content — the actual blocker

What is missing is mostly her: no photograph, no bio, no About text, no FAQs,
and the live site still shows the placeholder name "Yoga Flow". The real name,
**flow4ward**, only needs typing into `/admin/content`.

Full prioritised list: [docs/CONTENT-NEEDED.md](docs/CONTENT-NEEDED.md).
She fills it in herself at `/admin/content` — no developer needed.

- [ ] Photograph, intro, and About story (the three that matter most)
- [ ] Business name: type **flow4ward** into `/admin/content` → "Numele
      site-ului". It has been an admin field since
      `20260915000000_editable_site_name.sql`; `SITE_NAME` in
      `lib/site-config.ts` is only the fallback.
- [ ] Take the hardcoded location and name out of the structured data.
      `SITE_LOCALITY = "Cluj-Napoca"` is published as the business's town on
      every page, but she hosts events all over Romania; `INSTRUCTOR_NAME` is
      still the placeholder "Yoga Flow". Both live in `lib/site-config.ts`.
- [ ] 4–5 FAQs
- [ ] Instagram and Facebook addresses → `/admin/content`, under "Footer". Both
      fields accept a full address or just `@nume`; an icon with nothing behind
      it is not rendered, so the footer is honest while they are empty.

### Verification that has never run against production

- [ ] **One Stripe test payment, end to end, on the current code.** One was
      made in August (docs/JOURNEY.md, 4.5) and found three problems; the
      payment, expiry and waiting-list code has changed a lot since, and no
      automated test sends a Stripe webhook.
- [ ] **Subscribe the webhook endpoint to `charge.refunded`**, then test a
      refund. The handler exists, but Stripe never sends it the event, so a
      refund does not free the seat or notify the waiting list yet.
- [ ] Confirm the Stripe webhook endpoint points at the production domain.
- [ ] Check the site in Instagram's in-app browser on a real iPhone. WebKit is
      covered by the test suite; the webview itself is not.

---

## Before the next deploy

- [x] **Production is CLI-managed.** Done 11 September 2026. The four
      migrations were adopted with `migration repair --linked --status applied`
      rather than by resetting the project, so nothing was dropped — no
      `auth.users`, no Storage, no data.

      The decision rested on a schema diff rather than optimism. Dumps of both
      databases differed on 77 lines, all in three harmless categories: comment
      text inside `register_for_event` (the code is byte-identical, 42 lines);
      physical column order on three tables, because production acquired those
      columns through `ALTER TABLE ADD COLUMN`, which appends; and grants where
      **production is narrower** than local on `admins`, `profiles`,
      `event_availability` and `is_admin()`. Object inventories matched exactly
      — 13 tables, 18 policies, 11 indexes, 25 constraints, 3 functions.

      `npx supabase db push` is now the way a migration reaches production, and
      `db push --dry-run` reports the remote up to date.

- [x] **Close the grant drift.** Applied 12 September 2026 via
      `20260912000000_converge_role_grants.sql`, the first migration to reach
      production through `db push` rather than a paste. Five privileges that
      local held and production did not — on `is_admin()`, `admins`, `profiles`
      and `event_availability` — are revoked. Every statement is a no-op against
      production, which is the point: it records the state in the migration
      history so a rebuild from this repository produces production's
      permissions rather than a looser set.

      Narrowed local rather than widening production because `admins` turned out
      to be worth sealing. It has no grants for anon or authenticated, no RLS
      policies at all, and now nothing for service_role either — so no role
      reaches it through the API. A leaked service key gets every row of every
      other table and still cannot write itself into the list that decides who
      may enter `/admin`.

      One documented exception: `supabase/seed.sql` re-grants service_role
      insert on `admins` locally, because the password-reset specs create a
      throwaway administrator per test. That file never runs against production.
      A test in `tests/ui-consistency.spec.ts` asserts no application code reads
      the table, which is what keeps the exception from growing into a "works
      locally, fails live" bug.

- [x] **Stop relying on the default privileges, and prove it.** Closed
      12 September 2026, by guard rather than by changing the default.

      The two databases disagree about what a **newly created** table gets:

      | | new tables | new sequences | new functions |
      |---|---|---|---|
      | production | anon/authenticated/service_role get REFERENCES, TRIGGER, TRUNCATE, MAINTAIN | nothing | nothing |
      | local | all three get **ALL** | **ALL** | **ALL** |

      So a migration that creates a table without saying anything about grants
      produces a table `anon` can read *and write* locally, and one nobody can
      touch in production. Demonstrated rather than assumed: a bare
      `create table` on the local stack came out with `DELETE, INSERT, SELECT,
      UPDATE` for `anon`.

      The default itself is left alone.
      `20260905000000_revoke_default_anon_grants.sql` decided that already — it
      belongs to Supabase's project setup and the platform may re-apply it, in
      which case a revoke in a migration is silently undone and the drift
      returns with nobody the wiser.

      Instead, `tests/rpc-exposure.spec.ts` now asks PostgREST's root endpoint
      with the publishable key, which returns exactly what an anonymous visitor
      can reach, and fails if the set is not the seven tables and two functions
      it is supposed to be. It is self-updating — a new table appears there
      without anyone remembering to add it to a list — and it was checked by
      creating a table the careless way and watching it fail, naming the table.

      A third test asserts anon can read those tables and cannot write to them,
      because the enumeration proves *which* tables are reachable and not *what*
      may be done with them.

      **The rule this leaves:** a migration that creates a table states its
      grants explicitly. Inheriting the default is how you get a table that
      works locally and is unreachable live, or one that is world-writable and
      looks fine.

- [x] **Wire the footer's social links to content she owns.** Applied
      11 September 2026 via `20260911000000_footer_social_links.sql`. The admin
      panel had a section headed "General" holding an Instagram address and a
      public email that no component read, while the footer hardcoded `href="#"`
      on both its icons — the storage and the editing screen had been built and
      the consuming half never was. The section is now "Footer",
      `contact.email` is gone (contact runs through the rate-limited,
      CAPTCHA-protected form; a second plain-text address in the footer is the
      one an address harvester can read) and `contact.facebook_url` exists at
      last, the icon having had no field behind it since the beginning.

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
      descriptions. At the time production had no migration ledger, so
      `db push` was not safe; that changed on 11 September, when the ledger was
      created (the first item in this list), and `db push` is now the way
      schema reaches production.

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
      `supabase/migrations/20260912000001_object_comments.sql`, renumbered from
      99999999999999 on 12 September 2026: it can no longer be edited in place,
      because `db push` never re-applies a migration it has already recorded, so
      describing a new object now means a new dated migration.

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

- [x] **Revoke the inherited `anon` grants.** Applied 5 September 2026.
      Supabase's `alter default privileges ... grant all on tables to anon` had
      left `whatsapp_links`, `site_content`, `faqs`, `profiles` and
      `event_availability` holding privileges nobody wrote down. Production and
      a rebuilt database disagreed about which ones: production carried
      `REFERENCES, TRIGGER, TRUNCATE`, while replaying the migrations on a
      current CLI produced full `INSERT/UPDATE/DELETE` for `anon`. Neither was
      exploitable — RLS held in both, verified against seeded canary rows rather
      than trusting PostgREST's status code — so this was a rebuild-fidelity
      defect rather than a live hole. The baseline is meant to reconstruct
      production and on these five objects it had quietly stopped.

      Found by a CI failure, because CI is the only place that builds the schema
      from scratch on every run; a developer machine restores from a backup and
      keeps whatever state it already had. The August `db dump` comparison could
      not have caught it — `pg_dump` does not print default privileges as table
      grants, the same blind spot that hid the PUBLIC execute grant on
      `register_for_event`.

      Both databases now return `SELECT` and nothing else on seven objects, with
      `whatsapp_links` absent entirely. `TRUNCATE` was the one privilege worth
      removing on its own merit: it ignores RLS, so no policy would have
      contained it.

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

## Next

### Share images should use the brand typeface

The generated Open Graph and story images render in a system sans. Playfair
Display needs loading into Satori as font data. Cosmetic, but these images are
the first thing anyone sees of the site.

### Re-notify a waiting list that goes quiet

Partly done: saving an event in the admin panel now offers every free seat to
the front of the queue (`lib/notify-waiting-list.ts`), and a second save skips
anyone still holding a live link. Still missing: when a claim link lapses
unused, nobody else is told until the next save or checkout expiry. Wants a
scheduled job, or a "notify next" button in the admin waiting-list modal.

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
