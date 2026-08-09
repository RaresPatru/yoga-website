---
name: verify
description: Build, launch and drive this site to confirm a change actually works at the browser surface. Use when verifying a diff, not when running the test suite.
---

# Verifying this project

The surface is a browser. Drive it with Playwright (already a dev dependency)
and capture screenshots or DOM queries as evidence.

## Bring it up

```bash
npx supabase start                    # local Postgres/Auth/Storage (Docker)
set -a && . ./.env.test && set +a     # test env: local DB + Turnstile test keys
npm run build && npm run start -- -p 3100
```

Always verify against `npm run build && npm run start`, never `npm run dev` —
production and dev differ in ways that have hidden real bugs here.

`.env.test` uses Cloudflare's always-pass Turnstile keys, so forms can actually
be submitted. Without it every booking stops at the CAPTCHA.

## Gotchas that cost time

- **`supabase start` sometimes comes up half-dead** — the API gateway stops
  while Postgres stays healthy, and every request fails with
  `helper auth failed: fetch failed`. Fix: `npx supabase stop && npx supabase start`.
  A failed `supabase_studio` health check is harmless; studio is only the web UI.
- **Docker clock drift after the host sleeps** produces
  `JWT issued at future` on every authenticated call. Restart the containers.
- **The verified Turnstile widget is deliberately hidden** (`h-0 opacity-0
  inert`). Wait for it with `state: "attached"`, not the default `"visible"`.
- **Kill stray node processes before rebuilding** — port 3100 is often still
  held: `taskkill //F //IM node.exe //T`.

## Flows worth driving

| Change touches | Drive |
|---|---|
| Booking / capacity | Load an event, submit the form, reload and check the seat count moved. Fill it to capacity and confirm the sold-out badge and waiting-list form appear. |
| Editor / embeds | Sign in at `/admin/login`, create a post, insert the media, **save**, then load the public page — the editor and the public render can disagree. |
| SEO / metadata | `curl` the page and grep the HTML. Crawlers do not run JavaScript, so anything only visible after hydration does not exist for them. |
| Share images | Fetch the declared `og:image` with `-A "facebookexternalhit/1.1"` and check it returns a real PNG. Also check `robots.txt` does not block it. |
| Anything with links styled as buttons | `document.querySelectorAll("a button, button a").length` must be 0. |

Sign-in for driving the admin: `playwright-admin@test.local` /
`playwright-test-password` (created by `supabase/seed.sql`).

## The trap this project keeps falling into

Failures here are usually silent. Row Level Security returns an empty list
rather than an error; a missing CAPTCHA key returned "valid"; `asChild` across a
Server Component boundary quietly renders the wrong element; a page can return
HTTP 200 while a whole section failed to render.

So: **query the rendered DOM for what should be true**, do not just look at the
page and judge it fine. `querySelectorAll` counts, `boundingBox()` dimensions,
and grepping the raw HTML response all catch things a screenshot does not.
