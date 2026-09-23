# Working on this project

Bilingual booking site for a solo yoga instructor. Next.js 16 + Supabase +
Stripe on Vercel. Read [PLAN.md](PLAN.md) for what is outstanding and
[docs/DECISIONS.md](docs/DECISIONS.md) before changing anything that looks odd —
most of the odd-looking things are deliberate and explained there.
[docs/DATABASE.md](docs/DATABASE.md) maps the schema: what exists, who can read
it, and the checklist for adding to it.

**Every file here, docs included, was written by AI models,** and a full audit
on 22 September 2026 found the docs and code comments had drifted from the code
in dozens of places. When a document and the code or schema disagree, the code
wins — verify a claim before acting on it, and fix the document when it is
wrong.

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
  The current schema is one file,
  `supabase/migrations/00000000000000_baseline.sql`; do not edit it, add a dated
  migration alongside it.

  **State what every role may do, in the migration that creates the object.**
  Postgres checks `GRANT` and RLS separately and both must pass — missing grants
  have shipped broken features here twice — and the two databases inherit
  *different* default privileges, so a bare `create table` produces one that
  `anon` can read **and write** locally and nobody can touch in production.
  Neither half announces itself. Write `revoke all … from anon, authenticated`
  and then grant back what is needed, even when that is nothing.
  `tests/rpc-exposure.spec.ts` enumerates everything the publishable key can
  reach and fails on anything unlisted; `docs/DATABASE.md` has the template.

  **Migrations reach production with `npx supabase db push`.** The remote has
  kept a migration ledger since 11 September 2026, when the migrations existing
  at the time were adopted with `migration repair --status applied` after
  diffing both schemas to prove they matched. `npx supabase migration list
  --linked` should show a `remote` version against every row; if it ever shows
  blanks again, stop, because `db push` on an empty ledger would try to replay
  the baseline over the live schema.

  Two consequences of having a ledger:
  - **`db push` never re-applies a migration it has already recorded**, so
    nothing in `supabase/migrations` is a living file any more.
    `20260912000001_object_comments.sql` used to be edited in place; a change to
    it now reaches production not at all, silently. Describing a new object
    means a new dated migration.
  - The SQL Editor is back to being only a scratchpad. Anything saved there is
    a record of what you typed, not of what the database is.
- **Never run `supabase db reset --linked` without `--no-seed`.** `--linked`
  means production. `supabase/seed.sql` creates an administrator whose password
  is in plain text in the file, which is fine for a throwaway local database and
  a published credential on a live one.
- **Authorise through `is_admin()`; never query `admins`.** That table has no
  grants for any role the API can reach and no RLS policies, so a leaked service
  key gets every row of every other table and still cannot write itself into the
  list that decides who may enter `/admin`. `proxy.ts` and `lib/is-admin.ts` both
  call the RPC, which is `security definer` and reads the table as its owner. The
  local database has one extra grant so the suite can create a throwaway admin —
  it lives in `supabase/seed.sql`, never runs against production, and
  `tests/ui-consistency.spec.ts` fails if application code starts depending on
  it.
- **Tests must never point at the production database.** `tests/helpers.ts`
  enforces this and the guard is a hard crash. Do not soften it.
- **Security checks fail closed.** If a check cannot run, the answer is no.
- **Never derive money or payment state from the request body.** Read the price
  from the database.
- **No invented facts in user-facing copy.** No placeholder statistics, no
  default star ratings, no social icon linking to `#`. Unsupplied content either
  renders a visible placeholder (`components/ui/content-placeholder.tsx`) or is
  not rendered at all — `components/ui/rating.tsx` draws nothing without a real
  rating, and the footer omits an icon it has no address for. The exception is
  `supabase/seed.sql`, which is invented from top to bottom and only ever runs
  against a throwaway local database.

## Context that changes decisions

- **Almost every visitor arrives from Instagram, on a phone**, often inside an
  iOS in-app browser (WebKit). Mobile and WebKit are the primary target, not an
  afterthought — a CSP bug invisible in Chrome once broke the whole event page
  on iPhone.
- **Romanian is the primary language.** English falls back to Romanian when a
  translation is blank.
- **What the business actually is.** She is **flow4ward**, and she *hosts
  events*: yoga, sometimes combined with other activities such as horse riding
  or creative writing. No class timetable, no teacher training, and no fixed
  city — events happen anywhere in Romania. So nothing should hardcode a
  location: `SITE_LOCALITY = "Cluj-Napoca"` in `lib/site-config.ts` is a wrong
  placeholder that reaches structured data on every page, not a fact.
- **Status, 22 September 2026: pre-launch.** Production is publicly reachable
  but only Rares uses it, to test. There are no real customers and no real
  personal data in it, and Stripe is a test sandbox. Still treat it as live: it
  is the database she will run the business on.
- **The WhatsApp group link is public on purpose, for now.** Joining the group
  needs the admin's approval, so the link itself is not the gate. Rares will say
  how it should eventually work — do not lock it down unprompted, even though
  DECISIONS.md and the `whatsapp_links` table treat an invite URL as a secret.
- **The instructor runs the site herself.** Anything she might reasonably want
  to change — copy, photos, FAQs, her Instagram and Facebook addresses — belongs
  in the database and the admin panel, not in the source. Half-wiring it counts
  as not doing it: the footer's Instagram address had an editable field and a
  hardcoded `href="#"` behind it, which from her side is a screen that does
  nothing.
- This is also a portfolio piece. Comments should explain reasoning, especially
  in SQL and API routes, for a reader who is not a backend specialist.

## Commands

Rares runs **PowerShell 7 on Windows 11**, so every command or script handed to
him is PowerShell. Claude's own Bash tool is Git Bash; the `npm`/`npx` lines are
identical in both shells — only environment variables and deleting files differ.

```powershell
npx supabase start                # local database (needs Docker Desktop)
npx supabase db reset --local     # replay every migration + seed.sql. LOCAL — never --linked
npx supabase db push              # send new migrations to production
npm run dev                       # local database — prints which one on startup
npm run dev:prod                  # the live database; everything you do there is live
npm run mock:images               # rebuild /public/mock from ./mock-images
npm run lint && npx tsc --noEmit
npm run test:e2e                  # production build, one worker, 10+ minutes
$env:PW_DEV = "1"; npm run test:e2e; Remove-Item Env:PW_DEV   # the faster dev-server loop
Remove-Item -Recurse -Force .next                              # see "A stale .next" below
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
- **Supabase writes and Resend sends return their errors; neither throws.**
  `const { error } = await supabase.from("events").update(…)` — ignore `error`
  and a failed save looks exactly like a successful one, which is how the admin
  editors silently lost edits. Resend's `emails.send()` returns `{ error }` too,
  and logs it only outside production. Check `error` on every call.
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
- **Public pages must not use `lib/supabase/server.ts`.** It reads the visitor's
  cookies, so a visitor carrying an expired session makes Supabase refresh it
  mid-render — which writes a cookie, which a Server Component may not do. The
  throw escapes while gotrue-js is holding its refresh lock, nothing releases the
  lock, and the request hangs until Vercel answers 504. That took `/events`,
  `/blog` and `/testimonials` down while incognito windows stayed perfectly
  healthy, so the only people who could see it were the two with admin accounts.
  Use `createPublicClient()` from `lib/supabase/public.ts` — RLS still applies.
  `tests/stale-session.spec.ts` guards the behaviour and the import rule.
- **Nothing on this site is statically rendered, and `revalidate` does not
  change that.** `next build` marks every route `ƒ (Dynamic) server-rendered on
  demand` — the proxy runs on every request and next-intl resolves the locale
  from headers, so the whole tree opts out. The `export const revalidate = 300`
  on the home and about pages is therefore inert: her edits appear on the next
  request, not five minutes later. The lines stay as a ceiling in case a route
  ever becomes static-eligible, because the alternative default is caching until
  the next deployment. Do not reason about staleness from their presence — three
  comments and one test did, describing a cache this site has never had. Check
  the route table in `next build` output before believing any claim about
  caching here.
- **A stale `.next` makes the build lie.** `npm run build` reported `Failed to
  type check` with parse errors inside the `validator.ts` that Next generates —
  a file overwritten without being truncated, so it resumed mid-token from a
  longer earlier version. Delete `.next` (`Remove-Item -Recurse -Force .next`)
  and rebuild before believing a type error you cannot find anywhere in your
  own source.
- **A form that "does nothing" on WebKit is usually a hydration race.** Clicking
  submit before React has hydrated is swallowed silently — these forms have no
  `action`, so the native submit is a no-op too — and the test just sees a page
  that never changed. WebKit hydrates slower than Chromium, so it fails on the
  `mobile` project only and reads like a WebKit bug in the app. Wait for
  something that proves the client ran before interacting; on admin pages the
  translated copy is ideal, because `t()` returns the raw key
  (`admin.forgot_sent`) until the messages load in a client effect.
- **Upgrading `@playwright/test` needs `npx playwright install`.** Browser
  binaries are pinned per Playwright version, so a bump leaves the old build
  behind and *every* test fails in ~2ms with "Executable doesn't exist at
  ...chromium_headless_shell-####". It reads like the suite is broken; nothing
  is. Reinstall the two engines CI uses: `npx playwright install chromium
  webkit`. A green CI run alongside a red local one is this, every time —
  the workflow installs browsers on a fresh runner.
- **A red suite is usually Docker, not the code.** If tests fail instantly with
  `TypeError: fetch failed`, or `supabase status` says
  `No such container: supabase_db_yoga-website`, the local stack is down rather
  than the app being wrong. `npx supabase stop && npx supabase start` also
  clears the `container is not ready: unhealthy` failure that storage and studio
  hit periodically.

  A nastier variant: `db reset` failing with
  `LegacyDbSetupError: error running container` leaves the database **half
  built**, and every test then fails with `Database error querying schema` —
  which reads like the migration you just wrote destroyed the schema. It did
  not. Stop and start the stack, run `db reset` again, and it applies cleanly.

  Two more, both met on 22 September 2026:
  - `supabase start` failing its **health check** on storage is often just
    slowness: storage creates a `storage_vectors` database for the unused
    `[storage.vector]` feature and misses the CLI's deadline.
    `npx supabase start --ignore-health-check` brings everything up healthy.
  - "Starting database from backup..." can restore an **empty** database — no
    tables, no migration ledger — left over from an earlier failed start. Check
    `npx supabase migration list --local`: if every applied column is blank,
    `npx supabase db reset --local` rebuilds it.
- **The suite runs on one worker, and that is deliberate.** Two engines against
  a production build with Postgres in Docker beside them was enough to get
  WebKit killed mid-test, scattering one to three failures across unrelated
  specs on every run. Measured: 1-3 failures at two workers, 0 at one. Before
  believing a WebKit failure, re-run that spec alone — and do not raise
  `workers` to buy back the ninety seconds. See `playwright.config.ts`.
- **Pin `next` exactly and keep `@next/swc-*` in step with it.** Vercel runs
  `npm install`, not `npm ci`, so a floating range can resolve there to a version
  CI never saw. A caret on `next` beside literal `optionalDependencies` pins
  installed two different versions of the same native binary at once.
- **`npm run dev` reads the *local* database; `npm run dev:prod` reads
  production.** `.env` holds the production values and `.env.local` overrides the
  three Supabase ones with the Docker stack, which Next resolves in that order.
  Both commands print which one they picked on startup — read that line before
  concluding a change "did nothing", because an empty local database and a
  broken query look identical. `npm run dev:prod` re-asserts `.env` on top and
  is the only way to reach live data; everything you do there is live.
  The test suite is separate again: `playwright.config.ts` loads `.env.test`
  first and `tests/helpers.ts` hard-crashes on a non-local URL.
- **Local content comes from `supabase/seed.sql`,** which `npx supabase db reset`
  replays: six events, five posts, five testimonials, five FAQs and her copy,
  all invented except the business name. The soonest event is deliberately
  full so the home page's ordering rule has something to do, one is closed at
  capacity 0 with a waiting list, one has no start time yet, and the lead event
  deliberately has no photograph. None has a WhatsApp link, so anything that
  renders one is invisible locally until you add it in `/admin`. Pictures live in `/public/mock`, built from the gitignored
  `mock-images/` by `npm run mock:images`.
- **Tailwind v4 compiles `scale-*` to the individual `scale` property**, which
  does **not** override `transform` — the browser applies translate, rotate,
  scale and *then* transform, so the two multiply. `hover:scale-[1.02]` on an
  element Motion is already scaling by 1.02 gives 1.0404. Anything that gets a
  transform on hover also wants an identity (`scale-100`) at rest, or it creates
  its stacking context only while hovered.
- **Scaling a container scales the text in it**, so every line grows and its
  ends move: an event card's 300px description grows 6.6px, an admin tile's 77px
  label 1.7px. That is accepted on `GlassCard` and is not a bug — what is not
  accepted is the text stretching *past* its final width and springing back,
  which is what a spring with a low damping ratio does and what got reported
  from the live site as text "bouncing in place". Keep the overshoot near zero
  and growth reads as growth.
- **One hover for every card, and it lives in `GlassCard`.** `scale: 1.02` on a
  spring of `stiffness 300, damping 30, mass 1` — a damping ratio of 0.87,
  measured at 0.000% overshoot and 0.000px of springback. Do not retune it per
  page. A card animates if and only if the whole card is a link; everything else
  passes `hover={false}`, including the contact form and both sets of
  testimonial quotes, because an effect that does not lead anywhere stops the
  effect meaning anything.
- **Overshoot is a percentage of the travel, not of the final value.** A 10.8%
  overshoot on a scale from 1.00 to 1.02 peaks at 1.0222, not 1.13 — so a bound
  written against the absolute number catches nothing. The guard in
  `tests/ui-consistency.spec.ts` was wrong for exactly this reason on the first
  attempt and passed against a deliberately bouncy spring.
- **`cn` is plain `clsx` — there is no tailwind-merge.** Conflicting utilities do
  not resolve; both land in the class list and the cascade picks one, which is
  how `transition-transform` passed to `<GlassCard>` silently displaced
  `box-shadow` from `transition-property` and stopped the shadow easing. Never
  pass a component a utility it already sets.
- **`backdrop-filter` over a flat colour does nothing except change the text.**
  Blurring a solid background returns the same solid background — but it promotes
  the element to its own compositing layer, and Chrome then drops subpixel
  antialiasing. Measured on the home page: background pixels moved ≤11/255, text
  pixels up to 82/255. Use it only where content actually passes behind something
  (the fixed header, the mobile menu, the admin sidebar).
- **WebKit's Tab key does not walk links**, so a keyboard-navigation test passes
  vacuously on the `mobile` project. Safari ships "press Tab to highlight each
  item" off, and an iPhone has no Tab key at all; eight presses on /ro/blog
  produced only `BUTTON` and `BODY`, never an `<a>`. Move focus with `.focus()`
  and assert `el.matches(":focus-visible")` before reading the style — both
  engines honour that.
- **WebKit says yes to scroll-driven animations and then will not interpolate.**
  `timeline-scope`, `scroll-timeline`, a named `animation-timeline` and
  `@property` all report as supported in WebKit 26.6, and a custom property
  animated on a scroll timeline still moves in one step instead of tracking the
  scroll. Measured across a drag at 0, 25, 50, 75 and 100%: Chromium returns
  0, 0.25, 0.5, 0.75, 1 and WebKit returns 0, 1, 1, 1, 1. The recommended
  fallback does not save you, because `CSS.supports("animation-timeline:
  scroll()")` is *true* there — nothing detects it. The navigation drawer's dim
  is therefore driven by one `scroll` listener on every engine
  (`components/layout/header.tsx`), which is the boring version and the one
  that works where the visitors are.
- **Playwright's WebKit is not Safari, and the gap is silent.** Its build does
  not implement `overscroll-behavior` at all — `CSS.supports` says no and the
  longhand is missing from computed style — while Safari has shipped it since
  16. A test that asserts on that property fails against a browser engine that
  the audience never runs. Check `CSS.supports` in the engine before believing
  a Playwright-WebKit result about CSS support.
- **A WebKit flake that only CI sees may need Linux to reproduce.** Playwright
  ships a different WebKit port on Windows and on Linux, with different frame
  timing. The navigation drawer that closed itself as it opened did so on about
  one open in thirty on Linux and never in 180 on Windows, and for ten days it
  was blamed on hydration. Serve the test build on :3100 and run the spec from
  the `mcr.microsoft.com/playwright:v<version>-noble` image with
  `baseURL: "http://host.docker.internal:3100"`. Log what the page actually did
  before trusting a theory about why it failed.
