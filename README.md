# Yoga booking site

A bilingual (Romanian / English) site for a solo yoga instructor: event listings
with paid and free registration, capacity limits, waiting lists with expiring
claim links, a blog, transactional email with calendar invites, and an admin
panel she runs herself without a developer.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, Auth, Storage) ·
Stripe Checkout · Resend · Cloudflare Turnstile · Tailwind CSS 4 · Playwright ·
deployed on Vercel.

---

## Documentation

| | |
|---|---|
| [docs/JOURNEY.md](docs/JOURNEY.md) | What was wrong with this codebase and how each problem was found and fixed. The most interesting document here. |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why things are built the way they are. |
| [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md) | Guide for the instructor, in Romanian. |
| [docs/CONTENT-NEEDED.md](docs/CONTENT-NEEDED.md) | Content still to be supplied. |
| [PLAN.md](PLAN.md) | What is left to do. |
| [RESEARCH_FINDINGS.md](RESEARCH_FINDINGS.md) | Research into comparable sites, filtered to what applies here. |

---

## Running it locally

**Prerequisites:** Node 22+, Docker Desktop (for the local database).

```bash
npm install

# Starts Postgres, Auth and Storage in Docker, applies every migration in
# supabase/migrations, then runs supabase/seed.sql.
npx supabase start

cp .env.example .env.local     # fill in your own keys
npm run dev
```

`supabase start` prints a local API URL and keys. The seed creates a test
administrator and a little demo content, so `/admin` is usable immediately.

### Environment

`.env.example` lists what the application needs. `.env.test.example` is the
separate configuration the test suite uses — it points at the local database and
uses Cloudflare's published Turnstile test keys.

`NEXT_PUBLIC_SITE_URL` must be set in production. It is what makes canonical
URLs, share images and the links in waiting-list emails absolute; without it
those emails are built as `undefined/ro/events/...`.

---

## Tests

```bash
npm run test:e2e             # everything, against a production build
PW_DEV=1 npm run test:e2e    # faster loop while writing tests
npx playwright test --project=mobile
```

136 specs across four Playwright projects: `chromium` (public pages), `admin`
(authenticated, sharing one signed-in session), `admin-auth` (sign-in and
sign-out, run last), and `mobile` (WebKit on an iPhone viewport).

Two things worth knowing:

- **The suite refuses to run against a non-local database.** The helpers create
  and delete rows; they used to do that in production, and leftover test posts
  appeared on the live site.
- **Tests run against `next build && next start`, not the dev server.**
  `notFound()` returns 200 in development and 404 in production, and a test
  written against the dev server asserted the wrong thing.

Continuous integration runs lint, type-check, build, then the full suite against
a local Postgres on every push.

---

## Database

Everything is in `supabase/migrations`, applied in filename order, and the schema
replays from empty. Both halves of Postgres access control are declared there:
`GRANT` (may this role touch the table?) and Row Level Security (which rows?).
Both must pass, and leaving grants to be applied by hand in the dashboard is why
two features once shipped with `permission denied` errors.

```bash
npx supabase db reset                # replay all migrations + seed
npx supabase migration new <name>
```

Applying schema changes through the Supabase dashboard instead of a migration is
the one thing not to do here.

---

## Layout

```
app/[locale]/          public pages, server-rendered
app/admin/             admin panel (client-side, guarded server-side by proxy.ts)
app/api/               route handlers — registration, Stripe, uploads
app/api/og/            generated share images (link previews + Instagram stories)
components/            UI; components/events holds the client islands
lib/                   Supabase clients, email, validation, metadata, sanitising
supabase/migrations/   schema, in order
tests/                 Playwright specs and helpers
```

`proxy.ts` is Next.js middleware: it handles the `/ro` and `/en` locale prefixes
and blocks `/admin` server-side before any HTML is sent.

---

## Notes for anyone reading the code

The comments explain *why*, not *what* — particularly in the SQL migrations and
the API routes, several of which encode reasoning about security or concurrency
that is not obvious from the statements themselves. Start with
`supabase/migrations/20260807000003_event_availability_view.sql` if you want a
sense of the house style.
