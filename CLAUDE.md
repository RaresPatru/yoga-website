# Working on this project

Bilingual booking site for a solo yoga instructor. Next.js 16 + Supabase +
Stripe on Vercel. Read [PLAN.md](PLAN.md) for what is outstanding and
[docs/DECISIONS.md](docs/DECISIONS.md) before changing anything that looks odd —
most of the odd-looking things are deliberate and explained there.
[docs/DATABASE.md](docs/DATABASE.md) maps the schema: what exists, who can read
it, and the checklist for adding to it.

## Non-negotiables

- **Never push to `main`, and never commit or push without being asked.**
  `main` is wired to Vercel production, so pushing it *is* a deploy — there is no
  separate release step. All work goes on `feature`, which gets a preview URL.
  Ask before every `git add` / `commit` / `push`, every time, even when the task
  obviously ends in a commit; "fix X" is not permission to publish X. Only push
  `main` when told to in those words. `.githooks/pre-push` enforces the branch
  half of this — enable it once per clone with
  `git config core.hooksPath .githooks`.
- **Schema changes go in `supabase/migrations`, never the Supabase dashboard.**
  Declare `GRANT`s alongside RLS policies; Postgres checks both and missing
  grants have shipped broken features here twice. The current schema is one
  file, `supabase/migrations/00000000000000_baseline.sql`; do not edit it, add a
  dated migration alongside it. The SQL Editor is a scratchpad — paste a
  migration into a new tab, run it, delete the tab. Anything saved there is a
  record of what you typed, not of what the database is.
- **Tests must never point at the production database.** `tests/helpers.ts`
  enforces this and the guard is a hard crash. Do not soften it.
- **Security checks fail closed.** If a check cannot run, the answer is no.
- **Never derive money or payment state from the request body.** Read the price
  from the database.
- **No invented facts in user-facing copy.** No placeholder statistics, no
  default star ratings. Unsupplied content renders a visible placeholder — see
  `components/ui/content-placeholder.tsx`.

## Context that changes decisions

- **Almost every visitor arrives from Instagram, on a phone**, often inside an
  iOS in-app browser (WebKit). Mobile and WebKit are the primary target, not an
  afterthought — a CSP bug invisible in Chrome once broke the whole event page
  on iPhone.
- **Romanian is the primary language.** English falls back to Romanian when a
  translation is blank.
- **The instructor runs the site herself.** Anything she might reasonably want
  to change — copy, photos, FAQs — belongs in the database and the admin panel,
  not in the source.
- This is also a portfolio piece. Comments should explain reasoning, especially
  in SQL and API routes, for a reader who is not a backend specialist.

## Commands

```bash
npx supabase start / db reset    # local database (needs Docker Desktop)
npm run dev
npm run lint && npx tsc --noEmit
npm run test:e2e                 # production build; PW_DEV=1 for the fast loop
```

## Gotchas that have cost time

- `NODE_ENV` is `production` in a production *build*, even one pointed at a
  local database. Do not gate environment-specific behaviour on it — gate on the
  thing you actually mean.
- Supabase's `.select()` string must be a single literal; concatenating it
  breaks type inference and everything types as an error object.
- `supabase.auth.signOut()` defaults to **global** scope and revokes every
  session for that user.
- Row Level Security is a filter, not a lock: denied rows come back as an empty
  result with no error. An empty list may be a permissions failure.
- Playwright's `isVisible()` does not auto-wait. Branch on viewport width, not
  on a visibility probe.
- **A Suspense boundary high in the tree costs you HTTP status codes.** Wrapping
  `{children}` in the root layout made Next flush the shell immediately, so
  `notFound()` deeper down could no longer set 404 — every missing event
  answered 200 with a "not found" body. Keep boundaries around the component
  that actually needs one (`useSearchParams`), never around the whole app.
- **`<Button asChild>` does nothing from a Server Component.** It clones its
  child, which needs `isValidElement()`; across the RSC boundary the child is a
  serialised reference, so it silently renders a `<button>` wrapping your link.
  Use `buttonClasses()` from `lib/button-styles.ts` on the link instead. That
  file is deliberately outside the `"use client"` boundary — a Server Component
  may render a client component but may not call a function exported from one.
- The Turnstile widget is `inert` + `h-0 opacity-0` once verified, so Playwright
  must wait for it with `state: "attached"`, not the default `"visible"`.
- **Flex and grid items default to `min-width: auto`**, so they refuse to shrink
  below their content's minimum — and an `<input>` claims about 20 characters.
  The overflow therefore does not stay local: the column grows, then the grid,
  then the document, and the whole page scrolls sideways on a phone. Put
  `min-w-0` on flex/grid children that hold text or inputs, and `break-words` on
  anything the instructor types.
