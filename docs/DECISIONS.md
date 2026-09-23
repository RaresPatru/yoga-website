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

### `Button asChild` for links — client components only

`<Link><Button>` puts a `<button>` inside an `<a>` — invalid, and ambiguous for
screen readers. `asChild` renders one styled `<a>`, but only inside a client
component; from a Server Component use `buttonClasses()` on the link (see
"`buttonClasses()` lives outside the `"use client"` boundary" above).

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

### One retry, everywhere

Retries are on locally as well as in CI: a developer who sees red they cannot
reproduce learns to ignore red. The worker count went 3 → 2 → 1; the reasons
are under "One Playwright worker, measured rather than assumed" below.

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
reach Stripe as a negative charge, and a negative capacity is always a typo.
Both are refused by CHECK constraints, and the tests assert the *write* is
refused rather than that the attribute is spelled correctly. Zero capacity was
refused too, until `20260918000000_capacity_is_required.sql` made 0 — and
NULL — mean "sold out, waiting list only".

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

**The copy on each event is not secret, by decision (September 2026).** The
event page shows it to every visitor and the public API can read the column.
That is acceptable for now because joining the group needs the admin's
approval, so the link is not the gate. How it should ultimately be handled is
Rares's call and still open; until he decides, do not treat the exposure as a
bug to fix.

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

**`isomorphic-dompurify` stays on 2.x.** Every release after 2.26.0 runs on
jsdom 27 or later, up to jsdom 30 in 4.x. jsdom loads its dependencies with
`require()`, and one of them, `@exodus/bytes`, is `"type": "module"`:
ES-module-only. Vercel's functions refuse to `require()` an ES module. So every
page that renders stored HTML answers 500: blog posts, event descriptions,
About and the home page. Each fails with:

```
Failed to load external module jsdom-…: Error [ERR_REQUIRE_ESM]: require() of
ES Module …/@exodus/bytes/encoding-lite.js from
…/html-encoding-sniffer/lib/html-encoding-sniffer.js not supported
```

**It is not about the Node version.** That error took production down in August
2026, before `engines` pinned Node 24. Node 24 *can* `require()` an ES module,
and `next start` on Node 24 serves the upgrade without complaint. Then on
23 September 2026 a preview of 4.3.0 ran on Vercel's Node 24.x ("fluid"
functions). It failed with exactly that error on every route that sanitizes,
while the 2.26.0 preview beside it answered 200. Whatever Vercel's function
loader does, it does not allow this. A local production build is therefore no
evidence either way.

`tests/sanitize.spec.ts` reproduces Vercel's refusal: it loads the package with
Node's `--no-experimental-require-module`. An upgrade that would take the site
down fails CI first.

This unblocks when either of these happens:
- jsdom stops depending on an ES-module-only package, or ships CommonJS.
- Vercel documents that its functions allow `require()` of an ES module.

Either way, prove it on a preview before trusting it:

```powershell
$preview = "https://yoga-website-<id>-patru.vercel.app"   # from the Vercel check on the commit
foreach ($path in "/ro", "/en", "/ro/about") {            # all three render sanitized HTML
  vercel curl $path --deployment $preview -- --silent --output NUL --write-out "$path %{http_code}`n"
}
vercel logs --deployment $preview --level error --since 30m
```

Previews sit behind Vercel Authentication. `vercel curl` gets past it with the
project's "Protection Bypass for Automation" secret, and creates that secret
if the project has none.

**`typescript` is `~6.0.3`, not `^6`.** `@typescript-eslint/parser` declares
`typescript: ">=4.8.4 <6.1.0"` as a *required* peer. A caret would let
`npm install` pick 6.1 the day it ships and break the lint chain — and Vercel
runs `npm install`, not `npm ci`, so it is free to resolve differently from CI.
The tilde keeps us inside the peer range no matter what is published. TypeScript
7 is out for the same reason, one major further along. Re-checked 22 September
2026: typescript-eslint 8.70 still declares `<6.1.0`.

**`eslint` stays on 9.** ESLint 10 itself would be fine — the config is already
flat, there are no `eslint-env` comments, and Node 24 satisfies its engines. The
blocker is Next's lint preset: `eslint-config-next` pulls
`eslint-plugin-react`, `eslint-plugin-import` and `eslint-plugin-jsx-a11y`, and
all three cap their peer at `^9`. Only `eslint-plugin-react-hooks` accepts `^10`.
This unblocks when those three ship v10 support, which is not ours to do.
Re-checked 22 September 2026: all three still cap at `^9`.

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

### Every session is revoked on reset, explicitly

After a successful change the page signs out every session, this one included
(`global` scope — "A completed reset ends every session" below explains why the
first attempt, `others`, was not enough). Changing a password does not by itself
end sessions that already exist, and the reason someone resets one is usually
that they believe it is known to somebody else. Without this, an attacker
holding a stolen refresh token keeps their access and the reset accomplishes
nothing against the threat that prompted it. Supabase's "Secure password
change" setting covers part of this and is off on this project, so it is done in
code where it is visible and testable.

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

### The reset page latches itself shut once the password has changed

`finished` is a ref, set the moment `updateUser` succeeds and before the
sign-out that follows. Until it existed, the page could reopen its own form
after the reset was complete — reported from production, and worth writing down
because the mechanism is not obvious.

The auth listener stays subscribed for as long as the page is mounted, and
`isRecovery` remains true in its closure from the link that opened it. The
Supabase browser client synchronises sessions between tabs, so signing in
*anywhere else in the same browser* fires `SIGNED_IN` inside the finished page.
The listener saw "recovery, and a session" and put the form back — with the
typed password still in React state, one click from being submitted against an
ordinary session.

Supabase refused that submission, because "Require current password when
updating" applies to any session that did not come from a recovery link. That
refusal was the only thing making it harmless, which is the same dependency on a
dashboard setting this page had already been rewritten once to remove.

Two tabs in one browser is the reproduction; two Playwright *contexts* do not
share cookies, so the suite could not see it until the test used
`context.newPage()`. The regression test was checked against the unfixed page
first — it fails there, which is the only way to know it tests anything.

The fields are also cleared on success. A form that cannot be resubmitted is
better than one that can be resubmitted harmlessly.

---

## Look and feel

### One focus rule, in `@layer base`, wrapped in `:where()`

Nine treatments had grown up across the codebase and most controls had none at
all, falling through to the browser's black default ring. The replacement is a
single rule covering links, buttons, `summary` and every form control.

`:where()` is what made it safe to add rather than a migration: zero specificity,
so every Tailwind `focus-visible:` utility still outranked it while the old ones
were being removed, and the change could go in one piece instead of one component
at a time. It also means any control added from here is correct without anybody
remembering to style it — which is the actual failure mode, since none of the
unstyled controls were a decision.

`outline` rather than a box-shadow ring, for three reasons. It follows the
element's own `border-radius`, so a rounded card stops getting a square box. It
cannot be clipped by an `overflow: hidden` ancestor. And `outline-offset` shows
the page through the gap, which is what `ring-offset-cream` was simulating by
naming the background colour at every call site — a thing that silently goes
wrong the moment a ring appears on a surface that is not cream.

Two exceptions use `focus-visible:-outline-offset-2` because they sit flush
inside a clipping box and the outward offset would be cut off: the FAQ rows and
the country-search field inside the phone input's dropdown.

The rich-text editor is the other special case. TipTap's editing surface is a
`contenteditable` div, which the rule does not cover, so the outline goes on the
wrapper with `focus-within` — lighting the whole editor including its toolbar,
the way a text field would. Before that, the only sign the editor had focus was
the caret.

### The decorative rose was carrying text in fourteen places

`globals.css` splits each hue into a decorative value and an interactive one and
says the decorative ones must never carry text. Fourteen class strings were using
`text-rose` — the price badge on the events index, the active navigation item,
the active admin sidebar item, the editor toolbar's active state — at roughly
2:1 against their background. They now use `rose-deep`.

Three of them were on checkboxes, where `text-rose` did nothing whatsoever: there
is no forms plugin, so Tailwind's text colour has no effect on a native control.
Those use `accent-color` instead, which is the property that actually tints one.

### The hover spring: 300 / 30 / 1, and the effect is a promise of a click

Ten candidates went onto ten event cards and were judged by hovering rather than
argued about. They separated three questions that had been tangled together —
what moves, how far, and how it gets there — because only the third is what a
"spring" decides.

The chosen values are best read as one number, not three:

```
zeta = damping / (2 * sqrt(stiffness * mass)) = 30 / (2 * sqrt(300)) = 0.87
```

Below about 0.7 a spring visibly bounces, which reads as playful. At 1.0 and
above it is inert — a slow slide. 0.87 sits just under critical damping: the card
arrives, hesitates by a fraction of a pixel, and stops. Predicted overshoot
`exp(-pi*z/sqrt(1-z^2))` is 0.43% of the travel. The card scales from 1.00 to
1.02, so that is 0.00009 — a peak of 1.0201, which came back from the browser as
0.000% overshoot and 0.000px of text springback. The whole animation settles in
about 330ms.

That last conversion is worth keeping in mind, because getting it wrong made the
first version of the regression test useless: **overshoot is a percentage of the
travel, not of the final value.** A bouncy spring at zeta 0.58 overshoots 10.8%,
which on a 0.02 travel peaks at 1.0222 — so a bound of "less than 1.025", which
looks generous, sits above both the good case and the bad one and catches
nothing. The test now bounds at 1.021 and was checked in both directions: it
passes at damping 30 and fails at damping 20 with `Received: 1.0218`.

`mass` is written out even though 1 is the default, because it is the reference
the other two are expressed against rather than an independent dial: doubling it
alone halves the frequency and makes the card feel ponderous. It is what to
reach for if the lift should ever feel heavier, and what to leave alone
otherwise.

A spring rather than a tween for a reason that outlives the curve: Motion
integrates it frame by frame and carries velocity across interruptions, so
sweeping a pointer along a row resolves each card from wherever it actually was.
A tween restarts its curve from the top every time, which is what makes a fast
sweep look mechanical. `modern-web-guidance`'s physics-based-easing guide covers
the CSS `linear()` alternative; it approximates a spring with sampled stops and
cannot do the interruption case, so it is the right tool only where no JS
animation library is already present.

**The effect means the whole card is a link.** Three cards were animating
without being clickable — both sets of testimonial quotes and, worst of all, the
contact form, which moved while you were typing in it. They now pass
`hover={false}`, alongside the admin list rows that already did. A hover effect
only keeps meaning "click me" for as long as nothing else borrows it.

### The card scales, and the growth is the price of the effect

Reported from the finished site: text and icons on the event and blog cards
appeared to jitter and bounce in place until the hover finished, while the admin
dashboard tiles stayed still.

The tiles were not behaving differently. Scaling a card scales the text inside
it, so every line grows and both of its ends move. Measured at the peak of the
old spring:

| line | at rest | at the peak |
|---|---|---|
| event card description | 303.9px | 310.6px |
| event card title | 210.3px | 215.0px |
| blog card date | 128.4px | 131.2px |
| admin tile label | 77.1px | 78.9px |
| admin tile number | 15.0px | 15.3px |

The size of it follows how long the line is and how far it sits from the card's
centre, so it was obvious on a 400px event card carrying a 300px description,
mild on a blog date, and invisible on a 215px tile whose longest label is 77px —
four to twenty times smaller, not absent.

**The growth was never the complaint; the springback was.** The old spring had a
damping ratio of 0.58 and overshot by 10.8%, so every line stretched past its
final width and came back — a wobble, which reads as a fault rather than as
motion. The card briefly shipped as a 4px lift instead, which removed the growth
entirely and read as lacking. It now scales again, on a spring damped to 0.87:
measured 0.000% overshoot and 0.000px of springback, so each line grows once and
stops. A card that gets bigger is supposed to make its contents bigger.

There is a way to have the growth without the text moving — split the card into
a surface layer that scales and a content layer that does not — and it was not
taken. Every call site passes `className`, and those classes would have to be
routed to one layer or the other: `h-full` and `mt-8` belong to the outer box,
`overflow-hidden` and `flex-col` to the inner one. Getting that wrong is a
layout bug across twenty call sites in exchange for 6.6px. It stays available if
the growth ever does become the problem.

### GlassCard owns its own hover, and call sites may not add to it

Five public call sites passed `transition-transform hover:scale-[1.02]` through
`className` to a component that already animates itself. It compounded rather
than overrode — Tailwind v4 compiles `scale-*` to the individual `scale`
property, which multiplies with `transform` instead of replacing it — so the
cards grew 1.0404, took ~1000ms to settle instead of ~250ms, and lost the eased
shadow because `transition-transform` displaced `box-shadow` from
`transition-property`.

`cn` is plain `clsx` with no tailwind-merge, so conflicting utilities do not
resolve; they both land and the cascade decides. That is worth knowing before
passing any utility to a component that already sets the same one.

The component documents the ban at the top and `tests/ui-consistency.spec.ts`
enforces it structurally, so it fails on the next attempt rather than waiting for
somebody to notice a card feels wrong.

`whileHover` is JavaScript and does not respect `prefers-reduced-motion` the way
the `motion-safe:` variants on the buttons do, so the component reads
`useReducedMotion()` itself. The shadow still responds — that is a change of
depth, not of movement.

### One ground with one light source, instead of alternating bands

The home page alternated cream with a `bg-white/50 backdrop-blur-sm` band. The
band was 1.030:1 against the ground, and a card on it was 1.022:1 against the
band versus 1.053:1 on plain cream — so removing the bands more than doubled the
separation of the thing they were meant to frame. The alternation was hardcoded
per section while three of those sections render conditionally, so the live page
read cream, band, cream, cream, band.

The `backdrop-blur-sm` blurred a flat colour and therefore produced nothing.
Diffing the rendered page with and without every `backdrop-filter` moved
background pixels by at most 11/255 but text pixels by up to 82/255: promoting an
element to its own compositing layer changes how Chrome antialiases the text on
it. The blur's only observable effect was making text on two bands render
differently from text everywhere else. It stays where content genuinely passes
behind something — the fixed header, the mobile menu, the admin sidebar.

What replaced it is one continuous cream and a single radial light in the
top-left. It fades to transparent rather than to a colour, so there is no seam
anywhere and nothing to keep in step with which sections happen to render. Its
centre is offset by an absolute `-4rem`, not a percentage: percentages resolve
against the document height, so on a long blog post the light would drift off the
top of the page. `background-attachment` is left at its default so it scrolls
away naturally — `fixed` is the variant that costs a repaint per frame on iOS,
which is most of this audience.

### The footer's social links are content, and absent when unset

The two icons were hardcoded `href="#"` while the admin panel had a field for the
Instagram address that nothing read. They are now driven by `site_content`, in a
section renamed from "General" to "Footer" — the heading is generated from the
rows, so the meaningless name was coming from the data.

`contact.email` was removed rather than wired up. Contact goes through the form
on `/contact`, which is rate-limited and behind a CAPTCHA; a second address sitting
in the footer as plain text is the one an address harvester can read.

`lib/social.ts` normalises what she types. `@nume`, `nume`, `instagram.com/nume`
and a full pasted address all have to work, and the bare-domain case is the one
that matters: `href="instagram.com/nume"` is a relative path, so the browser
resolves it against this site and the link 404s on our own domain while looking
correctly typed. Only `http(s)` is echoed back untouched, which also means a
`javascript:` string pasted into the field can never reach an href — it falls
through to the handle branch and becomes a profile path that does not exist.

An icon with no address behind it is not rendered. A social button that looks
live and goes nowhere tells a visitor something untrue about the business, which
is the same rule as the one against invented statistics.

---

## Local development

### `npm run dev` reads the local database, and says so

`.env` holds the production values and `.env.local` overrides the three Supabase
ones with the Docker stack. Next loads `.env.local` after `.env` and lets it win,
so the safe target is the default and reaching production is
`npm run dev:prod`, which re-asserts `.env` as real environment variables —
those outrank every dotenv file Next reads.

The inversion is the point. Before this, "try something in the admin panel" and
"change the live website" were the same action: editing content at
`localhost:3000/admin/content` published it, deleting a test event deleted a real
one, and nothing anywhere said so. Now damage requires typing a different
command.

Both commands print one line naming the target on startup, because the failure
this actually caused was not damage but confusion: the footer rendered no social
links and the obvious reading was that the code was broken, when the code was
fine and the database was simply the other one. An empty local database and a
broken query look identical, and no amount of care distinguishes them by eye.

Two things that did **not** change, deliberately. The test suite keeps its own
resolution order — `playwright.config.ts` reads `.env.test` first and
`tests/helpers.ts` hard-crashes on a non-local URL — because a guard that
depends on the developer's dotenv files is not a guard. And Stripe, Resend and
Turnstile still come from `.env` in both modes, so local development can still
send a real email through Resend. That is pre-existing and worth fixing
separately; it is a different blast radius from the database.

### The seed is arranged to prove things, not to fill space

`supabase/seed.sql` builds five events, five posts, five testimonials, five FAQs
and a complete set of her copy. All of it is invented, which is exactly what the
rule against invented copy forbids everywhere else — the difference is that this
file only ever runs against a throwaway local database, and the rule exists to
stop plausible filler reaching a visitor.

The arrangement carries information:

- **The soonest event is full.** Ten of ten seats on the event five days out, so
  the home page's ordering rule has something to do and its effect is visible
  rather than asserted. Delete one registration row and that event should
  reappear at the top.
- **The lead event has no photograph.** It is the only card on the home page
  that renders one, so leaving it empty is the only way to see how that card
  copes.
- **One testimonial is left unapproved.** The moderation screen has something
  waiting in it and the dashboard's pending counter is not zero.
- **Blog posts are dated across five months** with explicit `created_at` values,
  because the home page shows the three most recent and every row defaulting to
  `now()` makes that choice arbitrary.

A page with one blog post does not show what a page with five looks like, and an
empty page hides every layout problem it has.

### Mock photographs are committed resized, and the originals are not

The source pictures are 2.6 MB screenshots; seven of them is 12 MB of binary in
git forever and a genuinely slow page. `npm run mock:images` resizes them to
1400px WebP — 310 KB for the set — and `/public/mock` is what gets committed, so
a fresh clone and CI both have them without anyone needing the originals.
`mock-images/` is gitignored.

Deliberately not wired into `predev` or `prebuild`: it would be dead work on
every build and it needs a folder most clones will not have.

### Which event the home page's carousel leads with

Soonest first, except that an event with no seats left gives up its place to a
later one somebody can still book. A full event is not hidden — it drops behind
every bookable date and appears only if there is room on the page.

The reasoning is that this block exists to sell a seat. The nearest date is the
most compelling thing to show right up until the moment it cannot be bought, at
which point it is an advert for disappointment and the next available date is
worth more.

Nothing has to happen when a seat frees up. `hasRoom` is computed per render
from live registration counts, so a cancellation restores that event to its
natural place by date on the very next request — the page is rendered on
demand, not cached (see CLAUDE.md on why `revalidate` is inert here).

Three implementation notes:

- **The ranking is in JavaScript, not the query.** How full an event is lives in
  the `event_availability` view, one row per event, and PostgREST cannot order a
  table by a column of an embedded resource. So the page fetches a bounded
  window of upcoming events — twenty-four — and ranks those. The bound is the
  compromise: if the next twenty-four were all full, a twenty-fifth with seats
  would not be found. That is not a state this site can reach.
- **The cutoff is an instant, not a date.** `date >= today` still matches this
  morning's class at six in the evening, so the filter runs through
  `eventStartInstant`, which resolves the stored wall-clock time through
  Europe/Bucharest and stays right across the daylight-saving switch.
- **The clock is read once.** `today` for the query floor and the time-of-day
  cutoff come from the same `new Date()`, so a render that straddles midnight
  cannot filter against two different days.

`/events` is deliberately left as a plain chronological listing. It is an index,
not a recommendation, and someone who opens it wants to see the calendar.

### One Playwright worker, measured rather than assumed

This went 3 → 2 → 1, each step for the same reason: the suite drives two browser
engines against a production build while a local Postgres runs in Docker beside
it, and WebKit is the thing that dies first. At three workers it was killed
mid-test and took unrelated specs down with it. At two it held until the seed
data grew — five events with photographs, five posts, five testimonials, five
FAQs — and then a different test failed on nearly every run: password-reset once,
navigation the next, the contact form after that, each passing when re-run alone.

The temptation was to fix the tests, and two attempts were made before measuring:
narrowing a `page.goto` from `load` to `domcontentloaded`, and raising the expect
timeout on the assumption that a hydration wait was running out of time. Neither
helped, because neither was the cause. Four consecutive runs at two workers gave
one to three failures each, in different places; the same suite at one worker
gave 227 passed, 0 failed, 0 flaky.

Ninety seconds is a good price. An intermittently red suite teaches people to
ignore red suites, which costs more than the time it saves. The `waitUntil`
change was kept — the narrower wait is correct on its own terms — with a note
saying it did not fix anything, so the next person does not credit it.

### `SeatCount` and `Rating` are shared components, not repeated markup

Both started as local functions inside a single page and both had already gone
wrong in the same way: the seat count existed on the home page and not on the
events index at all, so a visitor following "see all events" landed on a listing
that led with the very date the home page had demoted for being full, with
nothing to explain why. The rating existed only on the testimonials page, so the
home page's quotes carried no stars and no names.

Each is now one component with one behaviour. Two details in them are load
bearing and easy to undo by accident:

- **`Rating` renders nothing when the value is null.** The original site drew
  five filled stars above every quote from a hardcoded array, on a table with no
  rating column. Fabricated ratings devalue the real ones beside them.
- **`SeatCount` owns its own wording.** The two callers sit in different
  translation namespaces which had two different words for the same state —
  "Complet" and "Locuri epuizate" — so passing the label in meant the same event
  read differently depending on the page. One concept, one vocabulary.

  "Locuri epuizate" is the one that won, in September 2026. "Complet" had been
  chosen first and had two problems: it is also the word this site uses for a
  *full name* in every form it has, and on its own it never said what was
  complete. `docs/ADMIN-GUIDE.md` had been promising her "Locuri epuizate" the
  whole time, so that page went from wrong to right without being touched.
- **`SeatCount` counts in Romanian, which has three plural forms, not two.**
  The noun takes `de` once the last two digits leave the 1..19 window: "1 loc
  liber", "19 locuri libere", "20 de locuri libere". Capacity is hers to set
  from the admin panel, so twenty is an ordinary number here — this read "1
  locuri libere" on the card that matters most, the one with a single seat left.

### The dev server trusts `localhost` and nothing else

`next.config.ts` lists this machine's own IP addresses in `allowedDevOrigins`,
computed from `os.networkInterfaces()`. It looks like configuration for its own
sake. It is not.

`next dev` refuses the hot-reload websocket when the `Origin` header is anything
other than `localhost` — a guard against a hostile page driving your dev server,
and right to have. Replayed by hand against the running server:

```
Origin: http://localhost:3000     -> 101 Switching Protocols
Origin: http://127.0.0.1:3000     -> connection closed, no response
Origin: http://192.168.1.138:3000 -> connection closed, no response
```

The symptom is what makes it expensive. Without that socket the dev client never
finishes bootstrapping, so **React never hydrates and nothing on the page is
interactive** — the HTML arrives and looks perfect, the menu will not open, the
carousel will not move, no form submits. The only console output is a failed
websocket, which reads like a hot-reload nuisance rather than the cause. It is
worst where it is hardest to see: testing on a real phone, which can only reach
the machine by its LAN address and has no console to look at.

Verified after the change, on all three addresses: the header compacts on
scroll, the drawer opens, zero console errors.

The addresses are computed rather than written down because the router hands out
a different one whenever the lease expires. `127.0.0.1` is added by hand, since
`networkInterfaces()` reports the loopback as internal and filters it out.

### Tooltips are CSS, not `title`, and not the Popover API

`title` draws the operating system's tooltip: a black box with white text in the
system font. On a cream and sage page it reads as a fault, and no browser
exposes a hook to style it — so matching the site means not using it.

The current recommendation is interest invokers (`interestfor`) with
`popover="hint"` and anchor positioning. Measured support: interest invokers are
Chrome 142+ with nothing in Firefox or Safari, anchor positioning has no Safari
at all, and standing it up needs two polyfills. On the iPhone this audience
arrives with, none of the mechanism exists — the same trade already refused for
the navigation drawer.

So: a `::after` on `[data-tooltip]`, shown on hover and `:focus-visible`, in
app/globals.css. It is not the accessible name — every trigger has its own text
or `aria-label`, and nothing is said only by a tooltip. What it does worse than
a real popover is dismissal: Escape cannot close it, which WCAG 1.4.13 asks for.
`title` could not either, so nothing regressed.

**The trap:** the tooltip is the trigger's own `::after`, so a trigger with
`overflow: hidden` clips it away entirely. `truncate` is the usual way in — it is
three declarations under one name. The header wordmark had exactly that: the
tooltip computed as fully opaque, would have passed any assertion on `opacity`
or `content`, and painted nothing. It was found by looking at a screenshot, and
`tests/public-events.spec.ts` now fails if any trigger hides its overflow.

### The map is a link, and the calendar is the date

Both were buttons in a row under the description, alongside an Instagram
download. All three are gone.

An embedded Google map was built and measured before being removed: 1.23MB
across 39 requests from Google on a page that otherwise contacts them not at
all, the visitor's IP address handed over on page load before anyone asked to
see a map, a `frame-src` entry in the CSP, and an undocumented `output=embed`
endpoint outside the terms of the Maps Embed API. The address links to a map
instead and sends nothing until it is pressed.

Putting each action on the noun it acts on — the date adds the date, the address
opens the map — removed the row entirely. The cost is discoverability, and it is
real: a button announces itself and an underlined date has to be recognised.
Against it, both are second-visit actions rather than what the page is for, and
they now sit where somebody looking for the date or the address is already
looking. lib/meta-link.ts is what makes them read as live on a device with no
hover, and explains why it takes an icon, an underline *and* a darker ink rather
than any one of them.

### `ghost` buttons had a hover that did nothing

The variant's hover was `bg-white/40`. Over the cream page that resolves to
(255, 251, 246) against a resting (255, 248, 240) — three points of green, six
of blue, none of red, which is below what an eye picks up. Inside a `GlassCard`,
already white at 60%, it was fainter still. Measured from painted pixels after
the change: (255, 248, 240) to (245, 240, 229), a delta of about ten on each
channel.

It is now `sage/10`, the same wash the carousel arrows and the calendar menu
use, plus an `active:` state — Tailwind wraps `hover:` in `@media (hover: hover)`,
so on the phone this audience arrives with, a tap produced no feedback at all.

### `admins` is sealed off from every role the API can reach

The table decides who may enter `/admin`. It has no grants for `anon` or
`authenticated`, no RLS policies at all, and since
`20260912000000_converge_role_grants.sql` nothing for `service_role` either —
so in production no role reaches it through PostgREST. Only the `postgres`
superuser and the security-definer `is_admin()` can see it.

That is worth stating as a decision rather than leaving as a curiosity, because
it looks like an oversight next to the eleven tables where `service_role` holds
`ALL`. The reasoning is that the service key is the credential most likely to
escape — it sits in the API routes and in Vercel's environment — and the
authorisation root is the one thing that should survive its loss. Someone
holding it gets every row of every other table, including personal data, and
still cannot write themselves into the admin list and log in as a person.

It costs nothing, because no application code reads the table: `proxy.ts` and
`lib/is-admin.ts` both authorise through the `is_admin()` RPC, which is
`security definer` and therefore reads `admins` as its owner regardless of who
called it.

The local database is deliberately one privilege looser — `supabase/seed.sql`
grants `service_role` insert, so the password-reset specs can create a throwaway
administrator per test rather than borrowing the shared one whose password they
would then change. Putting it in the seed rather than a migration is what keeps
that honest: seed.sql runs on `db reset` and `supabase start` and nowhere else,
so the difference is declared and local instead of being an accident. A test in
`tests/ui-consistency.spec.ts` fails if any application code starts querying the
table, which is the only way the exception could turn into a bug that works
locally and fails live.

### Grants converge by narrowing the development database

Five privileges existed locally and not in production — on `is_admin()`,
`admins`, `profiles` and `event_availability` — and the fix revoked them locally
rather than granting them live.

The direction matters more than the specific privileges, none of which had a
consumer. A development database that allows *more* than production is how a
query passes every test and then fails with `permission denied` on the live
site, which this repository has shipped twice. A development database that
allows *less* fails loudly, in front of whoever is writing the code.

The migration is a no-op against production by construction — every statement
revokes something production had already lost. It runs there anyway, because the
value is in the migration history: a rebuild from this repository now produces
production's permissions rather than a looser set that happens to work.
