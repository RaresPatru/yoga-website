# Decisions

Choices that would be expensive to reverse, or that look odd without the
reasoning. Newest first within each section.

Not a changelog. If a decision is obvious from the code, it does not belong here.

---

## Architecture

### Keep Next.js + Supabase + Stripe

Considered replacing the stack during the August 2026 audit and decided against
it. Every problem found was a **usage** problem, not a stack problem: nothing
about Next.js caused the missing SEO — the framework had `generateMetadata` and
server components and they simply were not used. Rewriting would have discarded
working Stripe webhooks, transactional email, internationalisation, a TipTap
admin editor and a passing test suite, to fix bugs that were fixable in place.

`next/og` also turned out to be the right tool for the Instagram story images,
which is a first-party answer to the business's actual requirement.

### Suspense boundaries wrap the component that needs them, never the app

`PostHogProvider` calls `useSearchParams()`, which requires a Suspense boundary,
and that boundary had been put in the root layout around `{children}` — the
entire application.

The cost was not a rendering bug but an HTTP one. With everything inside
Suspense, Next flushes the document shell immediately and streams the rest, so
the response status is committed as 200 before any page can call `notFound()`.
Every missing event and article answered **200 OK** while displaying a "not
found" page: a soft 404, which search engines may index as a real page.

The boundary now wraps only the tracker component. Diagnosing it took three
experiments — it was not the middleware, and it was not a missing
`not-found.tsx` — because nothing about the symptom points at the cause.

### `buttonClasses()` lives outside the `"use client"` boundary

`<Button asChild><Link/></Button>` works by cloning its child, which depends on
`isValidElement()` recognising it. Across a Server Component boundary the child
arrives as a serialised reference, the clone branch is skipped, and a real
`<button>` is rendered wrapping the link — the exact invalid nesting `asChild`
exists to prevent, silently and with no error.

The first attempt at a fix made it worse: the styling function was exported from
the `"use client"` module, and a Server Component may render a client component
but may not *call* a function from one. The page still returned 200 while the
whole hero section failed to render.

So the classes live in `lib/button-styles.ts`, importable from anywhere, and
server-rendered links use `className={buttonClasses(...)}` directly. `asChild`
is kept for client components, where it does work.

Both faults were found by querying the rendered DOM (`querySelectorAll("a button,
button a")`), not by reading the component.

### Server components by default, client "islands" for interactivity

The event page was one large client component; its content existed nowhere in
the HTML. It is now a server component with the registration form extracted as a
small client component. All 118 existing tests passed unchanged after the
refactor, which is the evidence the behaviour was preserved.

The home page followed the same pattern.

### Docker for the database, not for the application

A container for the Next.js app would add a second build path Vercel does not
use. A container for Postgres solved an actual problem: tests were reading and
**deleting** rows in production.

### `google-translate-api-x` retained, with the risk noted

It scrapes an undocumented Google endpoint and can break without warning. Kept
because it is admin-only, optional, and needs no API key — the failure mode is a
translate button that stops working, not a broken site. DeepL's free tier is the
fallback if it does break.

---

## Database

### An `admins` table and `is_admin()`, not `auth.role()`

`auth.role() = 'authenticated'` means "signed in", not "administrator". With
public sign-ups enabled, anyone could satisfy it. Every policy now calls
`public.is_admin()`, which checks membership of an explicit list.

The function is `security definer` (so it can read a table the caller cannot) and
`set search_path = public, pg_temp` (so nobody can shadow `admins` with their own
table in a schema searched first). Supabase's linter flags any `security definer`
function missing the second.

### `event_availability` as a view — aggregation as a privacy boundary

Anonymous visitors need the seat count; they must not have the registrations
table, which holds names, emails and phone numbers. A view that returns only
`event_id`, `capacity` and `taken` can read the underlying table while the caller
cannot.

`security_invoker` is deliberately **off**. Turning it on would apply the
caller's permissions and the count would collapse back to zero — which is
precisely the bug this replaced.

### Capacity counts everything except `refunded`

Both the view and the `register_for_event` function use the same rule, on
purpose. When the displayed number and the enforced rule disagree you get the
worst kind of bug: a page saying "8/10 spots" beside a button answering "this
event is full".

`pending` **is** counted — that is someone in Stripe checkout right now, holding
the seat until they pay or the session expires.

### A `register_for_event` function instead of count-then-insert

Counting and inserting from application code leaves a gap where two simultaneous
bookings both see 14 of 15 and both succeed. Doing both inside one function, with
`FOR UPDATE` on the event row, makes the second caller wait for the first.

### Key/value for site content, a table for FAQs

`site_content` is one row per field so adding an editable field is an insert, not
a migration and a deploy. The trade-off — no compile-time safety, a typo returns
nothing — is mitigated by declaring the keys in `lib/site-content.ts` and seeding
every expected key.

FAQs are a proper table because they are a variable-length ordered list, which
key/value handles badly.

### Grants declared in migrations, not applied by hand

Postgres checks `GRANT` (may this role touch the table?) and RLS (which rows?)
separately, and both must pass. Grants had been applied ad-hoc in the dashboard,
so the schema could not be rebuilt from the repository — and two features shipped
broken with `permission denied` as a direct result.

---

## Security

### Payment state derived on the server, never from the request

`paymentStatus` was read from the request body. Anything determining cost or
payment state is now computed from the database row.

### Security checks fail closed

The CAPTCHA verifier returned `true` when its secret was missing. A check that
cannot run must answer "no". The costs are asymmetric: refusing a real person
produces a support message; admitting every bot produces a spammed database.

### Confirmation email sends from the webhook, not from registration

It carries the calendar invite and the WhatsApp group link, so it must not go out
before money has arrived. Previously anyone could start a paid booking, abandon
checkout, and keep the group link.

### `upgrade-insecure-requests` gated on the backend's scheme, not `NODE_ENV`

A production *build* pointed at a local database still has
`NODE_ENV=production`, so the browser was told to upgrade `http://127.0.0.1` to
HTTPS. Chromium exempts loopback addresses; **WebKit does not**, which broke the
event page on iPhone only.

### Upload limits enforced on the storage bucket

Uploads go browser → storage directly (Vercel caps request bodies at 4.5 MB), so
checks in the API route are advisory. The real constraints live on the bucket.

### iframe sources restricted to an allowlist

An unrestricted iframe means a convincing fake login form framed by the real
site. Patterns are anchored at both ends so `youtube.com.attacker.example` cannot
match.

### In-memory rate limiting, with the limitation documented

Per-instance and best-effort on serverless. Adequate against scripted abuse
alongside the CAPTCHA; shared storage (Vercel KV, Upstash) is the upgrade path.
Stated in the code rather than quietly implied.

---

## Design

### Two roles per colour, every pairing measured

One pastel per hue was doing every job. White on the primary button measured
**2.08:1** against a 4.5:1 requirement. Each colour now splits into decorative
(fills, washes) and interactive (`-deep`, for anything carrying text), with
ratios computed rather than judged by eye.

A side benefit: `#E8A0B4` is the pink of every wellness template; the accessible
`#A94E67` reads as dried rose and is less obviously generic.

### Events above the blog on the home page

Events are the only thing on this site that earns money, and a link shared to an
Instagram story is almost always about a specific one. They previously sat third.

### Headline before photograph on mobile

A 3:4 portrait at full mobile width is over 500px tall, so image-first meant a
whole screen of photograph before any explanation. Desktop keeps image-left.

### Placeholders that are visible

Unsupplied content renders with a dashed outline rather than plausible filler.
The previous page filled its gaps with invented statistics, which look finished
and are therefore never questioned. A visible gap gets closed.

### `Button asChild` for links

`<Link><Button>` puts a `<button>` inside an `<a>` — invalid, and ambiguous for
screen readers. `asChild` renders one styled `<a>`.

### Optional ratings on testimonials

`NULL` means unrated and draws no stars. Uniform five stars on everything is
fabricated proof that devalues the genuine reviews beside it.

---

## Testing

### Local Postgres, with a guard against anything else

The helpers create and delete rows; they used to do it in production, and
leftover test posts appeared on the live home page. The guard is a hard crash,
not a warning — a warning in a scrolling test log is a warning nobody reads.

### Cloudflare's Turnstile test keys

The CAPTCHA blocked the suite, so every registration test asserted the error
message and no test ever completed a booking. The always-pass key made the core
flow testable for the first time. The always-block key cannot coexist in the same
run, so the rejection path is tested at the API instead, where no race exists.

### Tests run against a production build

`notFound()` returns 200 in dev and 404 in production; a test written against dev
asserted the wrong thing. `PW_DEV=1` opts back into the faster loop while writing
tests.

### One shared login via `storageState`, and the logout spec runs last

Fifteen concurrent password logins for one account failed intermittently.
`supabase.auth.signOut()` also defaults to **global** scope — it revokes every
session for the user — so the logout test was invalidating the shared session
mid-run. Sequencing it last fixes the coupling without weakening sign-out, which
should mean "log me out everywhere" for an admin panel.

### A WebKit project, not just Chromium

Almost every real visitor arrives from Instagram on a phone; on iOS that is a
WKWebView. The project paid for itself within hours by catching a CSP bug
invisible in Chrome.

### Two workers and one retry

Two browser engines against a production build alongside Postgres in Docker was
killing WebKit processes at three workers, failing unrelated specs. Retries are
on locally as well as in CI: a developer who sees red they cannot reproduce
learns to ignore red.

### A warm-up pass before the suite

Playwright considers the server ready when `/` responds, but every other route
still compiles on first request. Cold starts were pushing simple page loads past
the navigation timeout.

---

## Flags, money and links

### Flag SVGs on disk, not emoji and not a CDN

The country picker started with flag emoji, which are pure arithmetic from the
ISO code — no files, no dependency, no Content Security Policy entry. They look
perfect on iOS and Android and render as the bare letters "RO" on Windows, which
ships no flag glyphs. That was acceptable while the argument was "the audience is
on phones", and stopped being acceptable once the same component had to look
right in the admin panel, which she uses from a desktop.

The replacement is 265 SVGs copied out of `country-flag-icons` into
`public/flags` by `scripts/copy-flags.mjs`, referenced as plain `<img>`. Not
`country-flag-icons/react`, which bundles every flag into the JavaScript — about
a megabyte shipped to a phone to draw one 20px image. As static files the browser
fetches only the selected flag plus whichever rows are scrolled into view.

The script runs from `predev` and `prebuild` rather than `postinstall`, because
Vercel can restore a cached `node_modules` and skip the install step while
`public/` is not cached — which would ship a picker full of broken images. It
throws rather than warning if the source is missing, for the same reason.

### A custom combobox instead of a native `<select>`

A native select is almost always the right answer on mobile: it opens the
platform's own picker and arrives with keyboard, screen-reader and type-ahead
behaviour for free. It was replaced anyway, for two reasons it cannot solve.

Its options are drawn by the OS *outside the page*, so a 240-entry list spilled
past the browser window on desktop, and nothing in CSS can constrain it. And a
closed select can only display the selected option's text, so that one string had
to be both readable in a long list and short enough for a 105px box.

The replacement is anchored `left-0 right-0` to the phone field, which means it
is exactly as wide as the field and provably cannot escape the card — no
magic widths, no viewport arithmetic. It adds a search box matching country name,
ISO code or dialling code, with diacritics folded so "romania" finds "România".

### Currency on the event, checked in three places

`price` was a bare number rendered as `${price} RON` in eight files, with
`currency: "ron"` hardcoded in the Stripe session. The currency now lives on the
event row, with a CHECK constraint listing the four supported codes, and every
render goes through `formatPrice` in `lib/money.ts`.

The Stripe route reads both the amount and the code from the row it just fetched,
never from the request body — the same rule as the rest of the payment path. It
narrows the value again on the way out, because Stripe rejects an unknown
currency at checkout, which is the worst possible moment to discover one.

### Negative prices are a database problem, not a form problem

The admin panel writes to Supabase directly from the browser, so `min="0"` on an
input is advice to whoever is typing and nothing more. A negative price would
reach Stripe as a negative charge; a capacity of zero makes
`taken >= max_participants` true for every event and marks the whole calendar
sold out. Both are CHECK constraints, and the tests assert the *write* is
refused rather than that the attribute is spelled correctly.

### The WhatsApp link library copies, it does not reference

Events keep their own `whatsapp_group_link` text rather than pointing at a row in
`whatsapp_links`. Choosing a saved link copies it. That means deleting a link, or
editing it because the group moved, cannot retroactively change what an event
says — including events whose attendees were emailed the old link weeks ago. The
library is a convenience for filling in a field, not the record of what someone
was told.

The table is also the one place with no public read policy. A WhatsApp invite URL
is a capability: anyone holding it can join the group. Anonymous callers get a
hard permission error rather than an empty list, because there is no GRANT — a
better failure than RLS filtering silently.

### The language switcher shows where you are, not where you would go

It displayed "EN" while the page was in Romanian. Both readings of a
single-language toggle are plausible and the only way to settle it was to press
it. The visible text is now the current language and the accessible name is the
action ("Switch to English"), which also means a screen reader announces what the
button does rather than reading out two letters.
