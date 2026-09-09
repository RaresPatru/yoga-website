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

### Sixteen migrations squashed into one baseline

The dated migrations that built the database are kept, verbatim and unreplayed,
in `supabase/migrations-archive/`. `supabase/migrations/` now holds a single
`00000000000000_baseline.sql` describing the current state.

The trade-off is real and was taken deliberately. A per-change history tells you
*why* something is the way it is, which is worth a lot; a baseline tells you
*what exists*, which is what you need far more often. Splitting them gets both,
at the cost of the two being able to drift apart — mitigated by the archive
being frozen, so there is nothing in it to keep in sync.

What forced the issue: reading the schema meant reading sixteen files in date
order and mentally applying the overrides, because `register_for_event` was
defined three times and `event_availability` twice. Nobody does that
consistently, which is how a grant on `storage.objects` lived in production for
a month without existing in any migration.

Equivalence was proved mechanically rather than by reading — the schema was
dumped before and after, and the 88 structural statements compared.

### The Supabase SQL Editor holds no schema

Only four read-only diagnostics, named. The editor records what you typed, not
what the database is; twenty tabs called "Untitled query" is how three versions
of the same function came to look equally authoritative. Worse, they were
ordered newest-first, so running them top to bottom would have reinstated the
oldest — reverting the RLS hardening and reopening every registration's name,
email and phone to any account that signed up.

Full reasoning in [DATABASE.md](DATABASE.md).

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

---

## Dependencies

### Four packages are deliberately held back

Everything else tracks the latest release. These four do not, and each has a
reason that outlived the upgrade that produced it. Re-checking them is cheap;
raising them because they look stale is how the site breaks.

**`isomorphic-dompurify` stays on 2.x.** Version 3 moved to a jsdom that depends
on `@exodus/bytes`, which is `"type": "module"` — ESM only. Vercel traces the
serverless bundle with `require()`, so the sanitizer 500'd every page that
renders stored HTML: blog posts, event descriptions, About and the home page.
Version 4 pulls jsdom 30, and jsdom 30 still lists `@exodus/bytes`, so the
condition that caused the outage is unchanged. The `.nft.json` files under
`.next/server` confirm jsdom really is traced into those routes, so this is not
theoretical. Check the dependency, not the version number: this unblocks when
jsdom drops that package or ships a CommonJS entry point, not when the major
number changes again.

**`typescript` is `~6.0.3`, not `^6`.** `@typescript-eslint/parser` declares
`typescript: ">=4.8.4 <6.1.0"` as a *required* peer. A caret would let
`npm install` pick 6.1 the day it ships and break the lint chain — and Vercel
runs `npm install`, not `npm ci`, so it is free to resolve differently from CI.
The tilde keeps us inside the peer range no matter what is published. TypeScript
7 is out for the same reason, one major further along.

**`eslint` stays on 9.** ESLint 10 itself would be fine — the config is already
flat, there are no `eslint-env` comments, and Node 24 satisfies its engines. The
blocker is Next's lint preset: `eslint-config-next` pulls
`eslint-plugin-react`, `eslint-plugin-import` and `eslint-plugin-jsx-a11y`, and
all three cap their peer at `^9`. Only `eslint-plugin-react-hooks` accepts `^10`.
This unblocks when those three ship v10 support, which is not ours to do.

**`@types/node` tracks the runtime, not the registry.** `engines.node` pins
Vercel to 24.x, so the types must describe Node 24. Taking `@types/node` 26
would type APIs the deployed runtime does not have — a build that passes and a
function that throws.

### `sharp` is overridden to a floor, and the floor has to move

The override exists to force `sharp` *up* past some libvips CVEs, from whatever
version Next asked for at the time. That made it a security floor. It then
silently became a ceiling: Next moved to `sharp: "^0.35.4"` while the override
still said `0.35.3`, so npm was holding the image optimiser *below* what Next
declared — the opposite of the intent. When Next raises its own range past the
floor, raise the override to match rather than leaving it pinned underneath.

The `allowScripts` key moves with it. Those keys are `name@version` on purpose:
an approval to run a build script is an approval for *that* build, so it expires
when the version changes rather than carrying over to code nobody looked at.

---

## Password reset

### Reset by email, and nothing else

The instructor is the only account. There is no colleague to reset her password
and no support desk, so the recovery email is not a convenience — it is the only
route back in if she forgets it. TOTP, passkeys and email OTP as a second factor
were all considered and dropped: each adds a way to be permanently locked out of
a site nobody else can let her back into, which on a one-person project is a
larger risk than the one it removes.

### The three signed-out `/admin` routes are an explicit list

`proxy.ts` keeps `PUBLIC_ADMIN_ROUTES` as an exact set, not a prefix match, and
`app/admin/layout.tsx` keeps the same three paths so they render without the
sidebar. Two lists, deliberately: one decides what is *reachable*, the other
what it *looks like*. A prefix match would have been shorter and would have
exempted every future `/admin/...` page somebody added under a similar name.

`/admin/reset-password` has to be on that list for a reason that is easy to miss.
Supabase returns the recovery token in the URL *fragment*
(`#access_token=...&type=recovery`), and a fragment is never sent to the server.
The proxy therefore sees a bare, sessionless request and would redirect to the
login page before the page's own JavaScript could read the token — every time,
making a perfectly valid link look broken.

Exempting the route costs nothing. The gate is not the proxy: `updateUser` needs
a session, and the only thing that mints one is a signed, expiring token that
Supabase mailed to the account's own address. Opening the page without one gets
a form that cannot submit.

### The form never says whether an account exists

`/admin/forgot-password` shows the same confirmation for a real address and an
invented one, and swallows errors rather than reporting them. Anything else is
an account-enumeration oracle — submit addresses, watch which are rejected,
learn which ones are registered. The copy is written to stay honest under that
constraint: it says an email has been sent *if* the address has an account,
rather than claiming one was sent.

### Other sessions are revoked on reset, explicitly

After a successful change the page calls `signOut({ scope: "others" })`.
Changing a password does not by itself end sessions that already exist, and the
reason someone resets one is usually that they believe it is known to somebody
else. Without this, an attacker holding a stolen refresh token keeps their
access and the reset accomplishes nothing against the threat that prompted it.
Supabase's "Secure password change" setting covers part of this and is off on
this project, so it is done in code where it is visible and testable.

`others` rather than `global`: this browser has just proved control of the
mailbox, and it is about to be sent to the login page anyway.

### The test uses a throwaway account and the real mailbox

`tests/password-reset.spec.ts` creates a user, drives the actual form, reads the
actual email out of the local mail catcher, follows the actual link, and then
checks that the new password signs in and the old one does not. It deliberately
does **not** touch the shared Playwright admin: that account's password is what
every other admin spec signs in with, so a test that changed it would break the
suite the moment it ran in parallel — or leave it unrunnable if it failed
halfway and never restored it.

Reading the link out of the email rather than minting a token in the test is the
point. The likeliest way this flow breaks in production is a `redirectTo` origin
missing from the Supabase allowlist, and that failure is silent: Supabase does
not error, it quietly falls back to the project's Site URL. Only an assertion
that follows the real emailed link can catch it.

### What the redirect allowlist actually is

Two settings, and the relationship between them is not obvious from the
dashboard. Measured against a real project rather than inferred:

| `redirectTo` asked for | Result |
|---|---|
| exactly the **Site URL** | honoured |
| any **path under the Site URL** | honoured |
| an entry in **Redirect URLs** | honoured |
| any other origin | **rejected**, silently replaced by the Site URL |

So the allowlist is the Site URL *and everything beneath it*, plus the Redirect
URLs list. That has a practical consequence worth knowing: once the Site URL is
the production domain, `/admin/reset-password` on that domain needs no entry of
its own. Redirect URLs are only for the *other* origins — preview deployments
and localhost.

The rejection is silent. Supabase does not return an error for an unlisted
`redirectTo`; it quietly substitutes the Site URL, so a missing entry looks like
"the email arrived but the link goes to the wrong page" rather than like a
configuration mistake. That is the failure mode
`tests/password-reset.spec.ts` guards by following the real emailed link.

### A completed reset ends every session, including the one doing the reset

`signOut({ scope: "global" })`, not `others`. `others` was the first attempt and
it left two holes, both found by testing rather than reasoning.

The visible one: resetting from the same browser that already had `/admin` open
did not sign that tab out, because it was the *current* session and `others`
excludes it by definition. Someone with the old password in a session on that
machine kept it.

The subtler one: completing a reset left that browser holding the session the
recovery link had created, and the page treated any session as permission to
show the form. Supabase consumed the token correctly — a fresh browser following
the same link is refused — but this browser could keep changing the password
without a new email until the session expired. The page now checks the `?error=`
Supabase returns *before* looking for a session, which is the signal that
actually distinguishes a spent link from a live one.

Revocation is immediate rather than eventual because `proxy.ts` calls
`getUser()` on every `/admin` request, which revalidates against Supabase
instead of trusting the cookie. Measured: an access token that answered 200
before the reset answers 403 after it, and its refresh token 400.

### The reset page requires a recovery session, not just any session

Showing the form to anyone holding a session was wrong, and production said so
before any test did: an admin who opened /admin/reset-password directly, while
already signed in, got

    Current password required when setting new password

Supabase exempts a *recovery* session from the project's "Require current
password when updating" rule — clicking a link sent to the account's mailbox is
itself the proof of control. An ordinary session gets no exemption, so
`updateUser` refused it.

The error was the safety net catching a design mistake, not the mistake itself.
With that setting off, the same page would have offered a no-questions-asked
password change to anyone sitting at an unlocked, already-signed-in browser. The
page now requires both a session *and* evidence it came from the emailed link
(`type=recovery` in the URL, or the `PASSWORD_RECOVERY` event), so it behaves the
same way whichever way the project is configured.

Worth noting how it escaped the suite: "Require current password when updating"
has no equivalent in `supabase/config.toml`, so the local stack cannot reproduce
it at all. The regression test therefore asserts the rule rather than the error
— a signed-in admin must not be offered the form — which holds regardless of
configuration. That is the second time a production-only setting has hidden
something the local database could not show, after the anon grants.
