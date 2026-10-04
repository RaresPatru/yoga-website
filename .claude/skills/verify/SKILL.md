---
name: verify
description: Build, run, start and drive this site in a real browser to confirm a change works at the browser surface - screenshot any page on desktop or an iPhone, book an event through the form and the Stripe stand-in, sign in to the admin panel, read the emails it sent and the statistics it recorded. Use when verifying a diff or asked to run, start or screenshot the site; not for running the test suite.
---

# Verifying this project

The surface is a browser. `serve.mjs` brings the site up the way the test
suite does: a production build on http://localhost:3100 against the local
database, with the suite's stand-ins for Stripe and PostHog. `driver.mjs`
drives it with Playwright and prints what is true on the page. Paths are
from the repository root; commands were run in Git Bash on Windows 11, and
the `node` lines work unchanged in PowerShell.

## Prerequisites

Node 24, Docker Desktop running, `.env.test` (copy `.env.test.example`,
paste the keys `supabase start` prints), and once per Playwright upgrade the
two browser engines:

```bash
npx supabase start
npx playwright install chromium webkit
```

## Run (agent path)

Bring it up in the background and wait for `READY`. `--build` rebuilds
first (a few minutes); leave it off only when the last build was made by
`serve.mjs` or the test suite and no code has changed since.

```bash
mkdir -p .playwright/verify
node .claude/skills/verify/serve.mjs --build > .playwright/verify/serve.log 2>&1 &
timeout 300 bash -c 'until grep -q "^READY" .playwright/verify/serve.log; do grep -q "refusing\|is taken\|failed\|exited" .playwright/verify/serve.log && exit 1; sleep 2; done' && grep "^READY" .playwright/verify/serve.log
```

Then drive it. Each command opens a fresh browser, does one thing, prints a
summary and closes. Screenshots land in `.playwright/verify/shots/`;
**look at them**.

```bash
node .claude/skills/verify/driver.mjs shot /ro                       # desktop Chromium, 1280x800
node .claude/skills/verify/driver.mjs shot ro/events --phone          # iPhone 14, WebKit
node .claude/skills/verify/driver.mjs shot admin --admin              # signed in as the seed's admin
node .claude/skills/verify/driver.mjs eval ro/events "[...new Set([...document.querySelectorAll('a[href*=\"/events/\"]')].map(a => a.getAttribute('href')))]"
EMAIL="verify-$(date +%s)@example.com"     # one seat per email per event: a fresh one each run
node .claude/skills/verify/driver.mjs book retreat-de-weekend --email "$EMAIL" --phone
node .claude/skills/verify/driver.mjs mail "$EMAIL"
node .claude/skills/verify/driver.mjs book retreat-de-weekend --email "$EMAIL"   # the same address again: refused
node .claude/skills/verify/driver.mjs stats --reset
node .claude/skills/verify/driver.mjs shot ro --linger 8
node .claude/skills/verify/driver.mjs stats
```

| command | does |
|---|---|
| `shot <path>` | opens the page, prints url, status, title, h1, the count of `a button, button a` (must be 0), console errors and failed requests, saves a screenshot. `--full` for the whole page, `--name` for the file. |
| `eval <path> "<js>"` | evaluates an expression on the loaded page and prints it as JSON: the way to check the DOM rather than eyeball it. |
| `book <event-slug>` | books through the form as a visitor: free, paid (through the stand-in's payment page, "Plătește"), or the waiting list when it is full. Prints the button pressed and the outcome heading, or `refused` and the message under the form; screenshots each step. Without `--email` it makes up a fresh address. |
| `mail <address>` | the local mailbox (Mailpit) for that address, newest first, with the newest email's text. |
| `stats [--reset]` | what the PostHog stand-in received: one line per event with the site's own properties. |

Flags: `--phone`, `--admin`, `--base <url>`. Stop everything (site and both
stand-ins):

```bash
node .claude/skills/verify/serve.mjs --stop
```

## Run (human path)

The same `node` lines in PowerShell. `serve.mjs` in the foreground prints
`READY` and keeps running; stop it from another window with `--stop`.

## Test

The suite is separate and builds its own server (stop `serve.mjs` first):

```bash
npx playwright test tests/analytics.spec.ts --project=chromium
npm run test:e2e        # the whole suite: about 23 minutes, one worker
```

## Flows worth driving

| Change touches | Drive |
|---|---|
| Booking, capacity, payments | `book <slug>` on a free, a paid and a full event, `--phone` too; then `mail` for the confirmation and `shot admin/registrations --admin`. |
| Statistics | `stats --reset`, the flow, `stats`. A `shot` needs `--linger 8` to be counted. |
| Editor, embeds | Sign in with `--admin`, change it in the editor, **save**, then `shot` the public page: the editor and the public render can disagree. |
| SEO, metadata | `curl` the page and grep the HTML. Crawlers do not run JavaScript. |
| Share images | `curl -A "facebookexternalhit/1.1"` the declared `og:image` and check it returns a real PNG. |

## Gotchas

- **Git Bash rewrites an argument that starts with `/`** into a Windows path:
  `/ro` arrived as `c:/Program Files/Git/ro`. The driver undoes it, and
  `ro/events` without the slash works anywhere.
- **`NEXT_PUBLIC_*` values are baked into the build.** A build made with other
  values (`NEXT_PUBLIC_POSTHOG_DEBUG=1`, production's key, a dev tweak) keeps
  them until `--build`.
- **Never navigate with `waitUntil: "networkidle"`.** Turnstile holds a request
  open forever: on `/ro/contact` networkidle had not arrived after 12 s, while
  `load` came at 250 ms. The driver uses `load`, then waits for
  `<next-route-announcer>`, which exists only once React has hydrated; a click
  before that is silently lost (WebKit hydrates later than Chromium).
- **Admin pages fetch their data after hydrating** and show a spinner until
  then: the first admin screenshot showed only the spinner. The driver also
  waits for `.animate-spin` and `aria-busy` to clear.
- **On a phone the booking card is below the description,** so a viewport
  screenshot showed the photo instead of "Plata a fost primită". The driver
  scrolls the form and the outcome to the middle of the screen.
- **Automated browsers are not counted by the statistics** (the site checks
  `navigator.webdriver` and "HeadlessChrome", and so does posthog-js). The
  driver's browsers look like a visitor's, so `stats` sees them. PostHog loads
  a few seconds after the page, so a plain `shot` closes before it sends.
- **The verified Turnstile widget is hidden on purpose** (`h-0 opacity-0
  inert`): wait for `[data-verified="true"]` with `state: "attached"`. The
  test keys in `.env.test` always pass.
- **Playwright's WebKit draws no backdrop blur,** so phone screenshots show
  page text through the top bar. Not a bug in the site.
- **Bookings made here stay in the local database** (`verify-*@example.com`).
  CLAUDE.md has the reset, local only.

## Troubleshooting

- **`page.goto: net::ERR_FILE_NOT_FOUND at c:/Program%20Files/Git/ro`**: Git
  Bash rewrote the path (above). Fixed in the driver; write `ro/events`.
- **`[serve] port 3100 is taken`**: an earlier server is still up. On Windows,
  stopping a background task can leave its `next start` listening.
  `serve.mjs --stop`, or find and end it:
  ```bash
  netstat -ano | grep ":3100 " | grep LISTENING
  taskkill //F //PID <pid> //T
  ```
- **`stats` says "nothing received"**: the visit ended before PostHog loaded;
  use `--linger 8`, or check it is a page that is counted (not `/booking`,
  `/unsubscribe`, `/testimonials/write`, `/preview`).
- **Paid booking fails with "Invalid API Key"**: the server was not started by
  `serve.mjs` or the suite, so it has no `STRIPE_API_BASE`. Stop it and use
  `serve.mjs`.
- **Every request fails with `helper auth failed: fetch failed`**: `supabase
  start` came up half-dead. `npx supabase stop`, then `npx supabase start`.
- **`JWT issued at future`** on every signed-in call: Docker's clock drifted
  while the machine slept. Restart the containers.

## The trap this project keeps falling into

Failures here are usually silent. Row Level Security returns an empty list
rather than an error; a missing CAPTCHA key returned "valid"; `asChild` across a
Server Component boundary quietly renders the wrong element; a page can return
HTTP 200 while a whole section failed to render.

So: **query the rendered DOM for what should be true** (`eval`), do not just
look at the page and judge it fine. `querySelectorAll` counts, element boxes
and grepping the raw HTML response all catch things a screenshot does not.
