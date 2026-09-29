# The September 2026 overhaul

The plan and progress tracker for the admin-panel and site overhaul Rares asked
for on 24 September 2026. [PLAN.md](../PLAN.md) points here while the overhaul
runs. What happened along the way goes in [JOURNEY.md](JOURNEY.md), and the
reasons behind choices that last go in [DECISIONS.md](DECISIONS.md).

**How to read it**

- The phases run in order. Each one ends with lint, type-check, the full test
  suite, and a commit to `feature` that Rares approves first.
- A box is ticked only when a test proves it, the same rule PLAN.md keeps.
- IDs such as **B5** refer to the local audit to-do list, which stays out of
  the repository.

---

## Status

| Phase | What it delivers | State |
|---|---|---|
| 0 | Groundwork: error handling, typed database, checkout fix, shared pieces | done, 24 Sep |
| 1 | Admin shell (sticky collapsible sidebar) and the dashboard | done, 24 Sep |
| 2 | Site content, one-switch bilingual editing, public copy and legal pages | done, 25 Sep |
| 3 | Blog: toolbar, post list, editor, public cards and article | done, 25 Sep |
| 4 | Events: admin list and editor, per-event numbers, public archive | done, 25 Sep |
| 5 | Registrations: one list with the waiting list, archive, notes, exports | done, 26 Sep |
| 6 | Testimonials and verified reviews | done, 28 Sep |
| 7 | Emails: editor, preview, test sends, announcements | done, 28 Sep |
| 8 | Messages: unread, starred, archive, letter view | done, 29 Sep |
| 9 | Public polish and speed: loader, transitions, FAQ, blur, back to top | done, 29 Sep |
| 10 | Stripe: the money path | not started |
| 11 | PostHog analytics | not started |

---

## Decisions

Made with Rares on 24 September 2026.

| Question | Decision | Why |
|---|---|---|
| Romanian and English fields | **One RO / EN switch per form.** In EN mode each field shows the Romanian text above it. An empty English field says it uses the Romanian text, which is what the site already does. One button translates everything, and a counter shows how much English is filled in. | Half as many fields on screen, the same layout in both languages, and it works the same on a phone. |
| Site content layout | **Sections with a side menu**, one section on screen at a time. Each has its own address (`/admin/content/home`) and its own Save. On phones the menu becomes a dropdown. | Nothing gets bloated, and new sections slot in easily. |
| Where archives live | **A tab inside each section**: Events *Upcoming · Drafts · Past*, Registrations *Active · Archive*, Messages *Inbox · Starred · Archive*. | Archived items stay where they lived, with the same search and filters. |
| Proving a reviewer attended | **An emailed personal link.** It is sent after the event, and the public page resends it to the booking email. | Nobody can post in someone else's name, and the page never reveals who attended. |
| Numbers on each event | **Five.** The *pending* group (waitlist, payment pending, refund requested) sits where the waitlist button was. The other two, offers awaiting reply and refunded, are for keeping track. Each number opens Registrations filtered to that event. | An event moves to the archive only when no payment or refund is pending. Its waitlist no longer matters once the event is over. |
| A waitlisted person whose seat was taken | **First come, first served.** If someone books the seat before the waitlisted person clicks, they see an apology and stay first in line until the event ends. | This is Rares' rule. |
| Editing a live post or event | **Private until "Publish changes".** Autosave keeps working, but visitors see the published version until then, and only Preview shows the new one. | Half-written sentences never go live. |
| Page transitions | **A breath fade**: the old page fades out, the new one fades in with a small rise, and the header stays still. **Plus a photo glide**: a card's photo glides into the page it opens. | Calm, about 0.3 seconds, cheap on phones, and off for anyone who turns animations off. |
| Button text left empty | **Its plain action**, such as "Vezi toate evenimentele". "Explorează" becomes "Vezi evenimentele". | A visitor always knows where a button leads. Only invented copy becomes a dashed placeholder. |
| Editor formats | **Only the code block goes.** Inline code and underline stay. | Rares' choice. |
| The name in the header | **Goes home.** On the home page itself it scrolls to the top. **Plus a back-to-top button** on long pages. | Tapping the name to go home is one of the web's strongest habits. |
| Participant notes | **An optional field in the booking form**, with a consent tick, plus her own note. Both are wiped 30 days after the event. | Health details are a special category under GDPR. |
| Long lists | **Numbered pages, 12 per page**, using `?page=2` in the address. | Shareable, readable by Google, and the back button returns to the right page. Twelve fills 1, 2 or 3 columns evenly. |

**An alternative kept on file.** If the one-switch pattern turns out awkward in
use, the fallback is **RO / EN tabs on each field's label**: each field
remembers its own tab. Nothing is built for it yet.

### Smaller calls I made

Rares can overturn any of these.

- **The words.** "Testimoniale / Testimonials" stays. The invitation button
  reads "Împărtășește-ți experiența / Share your experience", and the menu label
  is editable now anyway. The reasons are [below](#testimonials-or-reviews).
- **Video in testimonials** comes by link only (YouTube, Instagram, Vimeo,
  TikTok), never by upload. Participants add their own link, or she attaches
  one. See [why](#can-uploaded-videos-be-compressed).
- **Photos are compressed automatically**, from participants and from her own
  uploads alike. The browser shrinks the image, then the server re-saves it as
  WebP and strips hidden location data.
- **Promotional emails** go only to people who ticked an opt-in when they
  booked, and every one carries an unsubscribe link.
- **No cookie banner.** Nothing non-essential runs until someone presses play
  (see [privacy](#privacy-cookies-and-terms-in-plain-words)).
- **Autosave** runs 1.5 seconds after she stops typing, at most every
  10 seconds while she keeps typing, and again when she leaves the page. The
  latest copy is also kept in the browser until the server confirms it.
- **Editors get their own addresses**, such as `/admin/blog/…` and
  `/admin/events/…`, so the back button, refreshing and links all work.
- **The dashboard's event count** is what the events list's Upcoming tab holds:
  events to come, under way, or over with a payment or refund still pending
  (phase 4; it first counted published events that had not ended).
- **"Refund requested"** is something she marks for now. A self-service link
  comes with the Stripe phase.
- **Toolbar tooltips stay below the buttons** but now paint above the text. The
  toolbar sticks under the admin's top bar while she scrolls, and a tooltip
  above it would disappear behind that bar.
- **Legal pages are editable in the admin.** I draft them in both languages and
  mark every fact only she can supply as a visible placeholder. A lawyer should
  read them once before launch.
- **The sidebar's order** follows what she reaches for most: Panou de control,
  Evenimente, Înscrieri, Mesaje, Testimoniale, Articole, Email-uri, Conținut
  site. It used to put Conținut site second.
- **"Totul la zi" is for things waiting on her**: payments, messages and
  testimonials. Live events and her own drafts are facts rather than tasks, so
  at zero they say "Niciun eveniment activ" and "Nicio ciornă", and they never
  turn rose.
- **The admin's phone menu is a modal dialog**, not a copy of the public site's
  swipeable drawer. The browser handles focus and Escape, and she mostly taps.
  [DECISIONS.md](DECISIONS.md#the-phone-drawer-is-a-modal-dialog-unlike-the-public-sites)
  has the reasoning.
- **English labels are in sentence case**: "Blog posts", "New event",
  "Log out".
- **Joining a waiting list sends a confirmation** (`waitlist_joined`, phase 7).
  It sent nothing before, so people could not tell whether it had worked.
- **An automatic email is saved when she presses Save**, not on its own: the
  next email of that kind goes out with whatever is saved.
- **Replies go to an address she sets in Conținut site → Email-uri**, and to
  the address for personal data requests until she does. The name the emails
  come from is the site's name.
- **An announcement goes once per address**, addressed with the name and in
  the language of that person's latest booking, and a yes on any booking
  counts: the box asks about future events, not one event.
- **She can stop announcements to one person** from their panel in
  Înscrieri, for someone who asked by message rather than through the link.

---

## Answers to Rares' questions

### "Testimonials" or "Reviews"?

Keep **Testimonials** (RO: *Testimoniale*).

- **The connotation.** "Review" suggests products, marketplaces and star
  averages. "Testimonial" suggests a person vouching for an experience with
  another person, which is what her participants do.
- **Nothing breaks.** It matches the page that already exists (`/testimonials`)
  and any links to it already shared on Instagram.
- **The button asks for a story, not a score.** The invitation uses a verb:
  "Împărtășește-ți experiența".
- **She can still change it herself.** Menu labels are editable after
  Phase 2.

### Why pages sometimes wait before changing

Three things add up:

1. **Every page is built fresh.** The server builds each page on every visit,
   reading events, posts and texts from the database each time.
2. **Nothing is loaded ahead.** Next.js can only start loading a page like that
   before the click if the page has a loading screen to show first. None of
   this site's pages do, so each click waits for the server to finish the whole
   page before anything moves. The Next.js documentation names exactly this as
   the main cause of slow navigation.
3. **The distance to the database.** If the server (Vercel) and the database
   (Supabase) sit in different regions, every read crosses that distance, and
   a page makes several reads.

**PostHog is not the cause of the wait between pages.** It loads once, on the
first visit. It does add download weight to that first visit, and it also loads
on `/admin` for no reason. So it will load later and only on public pages.

**The fixes, in Phase 9:**

- **A loading screen with the lotus**, so every click responds at once.
- **A veil that blocks double taps.**
- **Reading data in parallel.**
- **Moving server and database into one region** if they are apart. Checking
  that needs Rares (see [Needs Rares](#needs-rares)).

**What Phase 9 found:** they were apart, the server in Washington and the
database in Paris, and that was most of the wait. The server now runs in
Paris. The lotus became part of the veil rather than a loading screen of its
own. [Phase 9](#phase-9-public-polish-and-speed) has the numbers.

### How bad is the wordmark scrolling to the top?

**Moderately bad for new visitors, harmless for regulars.** Someone arriving
from Instagram lands on an event page. When they tap the name, the page scrolls
up and they are still on that page. On a phone, "Home" is otherwise tucked
inside the menu.

**It costs a confusing tap at the moment someone decides whether to explore the
site.** Nothing actually breaks.

Settled above: the name goes home, and a back-to-top button covers the other
habit.

### Can uploaded videos be compressed?

Technically yes, practically not here.

- **Compressing in the browser costs too much on a phone.** A phone video is
  50–500 MB. The browser would first download a video engine of about 30 MB,
  then spend minutes of battery on the phone. It often fails inside Instagram's
  own browser.
- **Compressing on the server needs a paid video service,** and the free
  database plan holds 1 GB of files in total. A handful of videos would fill
  it.
- **A link costs nothing.** The video goes on YouTube, Instagram or TikTok, and
  the link is pasted in. The site shows a still preview that plays when
  pressed.

### Can photos be compressed?

Yes, the same way the sample photos in the repository were:

- **Before sending,** the browser shrinks the photo, so it uploads quickly on
  mobile data.
- **On arrival,** the server re-saves it as WebP. A profile photo typically
  comes out at 50–150 KB.
- **Hidden data is removed.** That includes the GPS location phones embed in
  photos.

Her own uploads (the logo, the hero photo and blog images) get the same
treatment.

### How will emails know whether to send Romanian or English?

**Resend is the postman.** It delivers whatever letter it is handed, and the
site writes the letter.

- **Each booking remembers its language.** Someone who books on the English
  site (`/en/...`) is stored as "English", and every email about that booking
  comes from the English template.
- **Everyone else gets Romanian:** anyone who booked on the Romanian site, and
  anyone who booked before this change.
- **Announcements are written in both languages once.** Each person then gets
  the version in the language they booked in.

### Privacy, cookies and terms in plain words

**Who is responsible for what**

- **She is the "data controller"**: the business that decides why personal
  data is collected.
- **Her "processors"** are the companies that store or handle that data for
  her: Supabase (database), Vercel (hosting), Stripe (payments), Resend
  (email) and Cloudflare (spam protection). The privacy policy names them.

**The three pages she needs**

- **A privacy policy.** It covers what data is collected and why, how long it
  is kept, who else sees it, people's rights, and how to complain to
  **ANSPDCP**, the Romanian data-protection authority.
- **Terms and conditions.** They cover booking, payment, cancellation and
  refunds, a health disclaimer, and photos taken at events.
- **A cookie policy.**

**Why no banner.** EU law asks for consent only before *non-essential* cookies:
analytics, advertising and embedded social media. This site will set none of
those without a click:

- **Embedded videos wait for a click.** Instagram, YouTube and TikTok videos
  stay a still preview until someone presses play, and the preview says so.
- **Analytics will run without cookies**, once it is switched on (Phase 11).

**Health notes** are a special category. They need explicit consent and are
deleted 30 days after the event.

**Promotional emails** need a ticked opt-in and an unsubscribe link in every
message. That is Romanian Law 506/2004, art. 12.

**Reviews.** EU rules (the Omnibus directive) require saying how reviews are
checked. The testimonials page will say that every testimonial comes from a
verified participant.

**ANPC**

- **The footer needs the SAL pictogram.** Romanian consumer rules require its
  *new* 250×50 version, linked to `https://reclamatiisal.anpc.ro`.
- **The old SOL badge is no longer required.** The EU platform behind it closed
  in July 2025, and ANPC Order 270/2026 removed the badge.

**The 14-day right to withdraw** does not apply to leisure services booked for
a specific date (Directive 2011/83/EU art. 16(l); OUG 34/2014 art. 16 lit. l).
The terms say so, and her own refund policy applies instead.

**Where it lives.** Rares guessed an admin section is the right place, and it
is: she can update these pages without a developer.

- **I draft both languages.**
- **She fills in the facts** only she knows.
- **A lawyer should read it once before launch.** None of this is legal
  advice.

Sources:
- [ANPC Order 270/2026 (legislatie.just.ro)](https://legislatie.just.ro/Public/DetaliiDocumentAfis/310590)
- [SOL platform closed (Grecu Partners)](https://greculawyers.ro/platforma-sol-desfiintata/)
- [Law 506/2004 art. 12](https://legeaz.net/legea-506-2004-prelucrare-date-caracter-personal/articolul-12)
- [CJEU C-654/23 on soft opt-in](https://www.twobirds.com/en/insights/2025/understanding-soft-opt-in-when-free-deals-count-as-a-sale-under-eprivacy-rules)
- [Omnibus directive and reviews](https://www.mondaq.com/dodd-frank-consumer-protection-act/1189542/the-omnibus-directive-consumer-reviews)

---

## Phases

### Phase 0: Groundwork

Building blocks every later phase uses, plus the fixes Rares named for now.
**Done 24 September 2026.** The full suite passed on a production build (425
passed, 11 skipped). Its two failures were an event someone had unpublished in
the local database. After `db reset` rebuilt it from the seed, both passed.

- [x] **The 23 September editor work got its own commit** (`e60bf5f`).
- [x] **Typed database (W3).**
  - `lib/database.types.ts` is generated from the local schema, and all four
    Supabase clients use it.
  - The 30 errors it surfaced are fixed:
    - one was the share-image crash for events without a start time (**B8**, a
      bonus fix);
    - most were flags and timestamps that allowed NULL, now `NOT NULL`.
- [x] **Admin errors never lose her work (B5).**
  - `must()` in `lib/admin/db.ts` turns every `{ error }` into one sentence.
  - It is fitted into the current blog, event, email, testimonial, message,
    content, media and WhatsApp screens.
  - A failed save leaves the editor open with what she typed.
  - Tested: `tests/admin-save-errors.spec.ts`.
- [x] **One data hook** (`useAdminData`) replaces the duplicated load + effect
  pairs on the seven admin screens that had them (R4).
- [x] **Confirmation dialog and toasts** (`components/admin/ui/`) replace every
  `window.confirm` and `alert` in the admin.
  - The admin's tests now answer the in-page dialog.
  - The rest of the building blocks arrive with the first screen that uses
    them, so each is tested on a real page:
    - page header and switch: phase 1;
    - fields, text areas and segmented control: phase 2;
    - tabs, search, sort, badges, bulk selection, pagination and menu:
      phase 3.
- [x] **B1 and the checkout half of R4.**
  - One `createCheckoutSession()` in `lib/stripe-checkout.ts` serves
    `/api/stripe/checkout` and the waiting-list claim route.
  - It charges the event's own currency, and passes the email and language.
  - Return addresses come from the site's URL (or a preview's own), which
    closes S4.
  - Tested without Stripe: `tests/checkout-params.spec.ts`.
- [x] **The rest of R4:**
  - one `EMAIL_RE`;
  - one `.env` parser (Node's `parseEnv`, in both places);
  - the share-image colours from `lib/brand-colors.ts`, checked against the
    CSS by `tests/brand-colors.spec.ts`;
  - the CI comment kept once;
  - the identical ternary gone;
  - one route list, which now includes `/about`.
- [x] **B29.** `updated_at` is kept current by a trigger, and the sitemap
  reports it. Tested: `tests/updated-at.spec.ts`.
- **Moved to later phases, where they are first used:** the bilingual kit
  (phase 2) and `useAutosave` (phase 3).

**New migrations**

- `20260924000000_updated_at_triggers.sql`: the trigger function (not callable
  through the API) and its triggers.
- `20260924000100_required_flags_and_timestamps.sql`: flags and timestamps
  become `NOT NULL`.

**Found along the way**

Under row-level security, Postgres leaves a unique violation's `details` empty,
so the admin never sees "Key (slug)=…". The error translator reads the
constraint's name instead. The gotcha is now in CLAUDE.md.

### Phase 1: Admin shell and dashboard

**Built 24 September 2026.** The full suite passed on a production build: 448
passed, 11 skipped, none failed. Four event-timing tests written during that run
passed on their own afterwards (`admin-events.spec.ts`, 18 of 18).

- [x] **Route groups.** `app/admin/(auth)/…` holds the three sign-in pages,
  without the sidebar. `app/admin/(panel)/…` holds everything else inside the
  shell. The panel layout is a server component that reads the sidebar cookie,
  so the page never flashes the wrong width. `app/admin/layout.tsx`, above
  both, reads her site name once and provides the language, toasts and
  confirmations.
- [x] **The sidebar on desktop.**
  - It sticks: full height, and it never scrolls away.
  - Wide it is 15 rem; the icon rail is 4.5 rem.
  - The toggle at the top uses Rares' two icons, in place of "Yoga Admin"
    (B32).
  - Pinned narrow, it widens over the page when the pointer rests on it
    (120 ms) or keyboard focus enters it, and narrows 250 ms after the pointer
    leaves. The page underneath does not move.
  - Only the toggle pins it, and a cookie remembers the choice for a year.
  - It marks the current page, starts with a skip link, and animates only for
    people who haven't turned animations off.
- [x] **The top bar** shows "flow4ward Admin" from her site name, "Vezi
  site-ul" opening the public site in a new tab, and the language switch.
- [x] **On phones** a menu button in the top bar opens the same links in a
  modal drawer. Focus stays inside; the close button, Escape, a tap outside
  or following a link closes it.
- [x] **Every page has its own heading and tab title** (B21), such as
  "Evenimente · flow4ward Admin". The heading repeats the sidebar's label word
  for word: "Articole" rather than "Articole Blog", "Email-uri" rather than
  "Template-uri Email".
- [x] **The dashboard** works as a notification area and secondary navigation.
  Each row is a sentence with the right plural form, and each is a link:
  - Evenimente: published and not yet ended.
  - Înscrieri: payments pending, still inside the one-hour hold.
  - Mesaje: unread and not archived.
  - Testimoniale: awaiting approval.
  - Articole: drafts.

  Rows for things waiting on her turn rose, and read "Totul la zi" at zero.
  Below them:
  - the next event, meaning the soonest that hasn't ended: its date, how soon
    it is, seats taken, people on the waiting list, payments pending, and a
    link to its public page
  - quick actions: "Eveniment nou" and "Articol nou" open the empty forms
- [x] **Each row opens its list already filtered** (`?status=pending`,
  `?filter=unread`, `?tab=pending`, `?tab=drafts`). Each list learned to read
  its filter when its phase rebuilt it: the posts in 3, Registrations in 5,
  Testimoniale in 6 and Mesaje in 8, the last of them. Each list's spec opens
  it from that address.

**New migrations**

- `20260924000200_event_bounds.sql`:
  - `starts_at` and `ends_at`, generated by Postgres from the date and times
    in Europe/Bucharest, which nothing can write directly
  - `show_in_archive`
  - `events_ends_after_start` (see below)
- `20260924000300_message_state.sql`: `read_at`, `starred`, `archived_at`
  and `locale`.
- `20260924000400_admin_dashboard.sql`: the admin-only views
  `admin_event_overview` (per event: people waiting, payments pending) and
  `admin_dashboard` (the five counts).

**Tests**

- `admin-shell.spec.ts` (new):
  - the sidebar stays in view at the bottom of a long page
  - pinned narrow survives a reload and keeps its link names
  - hover and keyboard focus widen it over the page
  - the current page is marked
  - every section's heading and tab title, including after a full load
  - the top bar and the skip link
- `admin-mobile.spec.ts` (new), in a new `admin-mobile` project on iPhone
  WebKit: no sidebar and no sideways scroll; the drawer's links; every way of
  closing it.
- `admin-dashboard.spec.ts` is rewritten:
  - each count's rule, as a difference, so other specs' rows don't matter
  - every plural form, in both languages
  - the rows' links
  - the next event and its numbers
  - the quick actions
  - visitors can't read either view
- `plural.spec.ts` (new): Romanian's three forms, including 101 to 119.
- `admin-login.spec.ts`: the sign-in page's tab title.

**Found along the way**

- **An event could end before it started.** The old checks only compared
  times when the end date was filled in, so a one-day event from 18:00 to 10:00
  saved without complaint, and it would have counted as over before it began.
  `events_ends_after_start` now compares the two instants, and the editor
  checks the same rule before saving.
- **Next.js put the generic tab title back.** On a full page load it writes
  the layout's title after the page has set its own. `useDocumentTitle()`
  now restores the page's title whenever something changes it.
- **B30, the rest of it:** the "Gratuit" and "Aprobat" badges were light sage
  text, about 2:1, and are now the deep sage. The registrations search box had
  no label, and now has one.
- **The admin announces its language.** `<html lang>` used to say Romanian
  even when the panel was in English, so a screen reader read English with
  Romanian pronunciation. It now follows the panel's language.

### Phase 2: Site content, bilingual editing, public copy, legal pages

**Built 25 September 2026.** The full suite on a production build: 484 passed,
11 skipped, 1 failed. The failure was a test reading the header's first link as
the section links, which the wordmark now is; fixed, `public-home.spec.ts` then
passed in both engines (87 of 87).

- [x] **The content schema lives in code** (`lib/site-content-schema.ts`):
  sections, groups, fields, labels, help, and what a visitor sees while a field
  is empty. Adding a field is one entry; the admin creates its row on the first
  save.
- [x] **Ten sections, in menu order:** Identitate, Rețele sociale, Meniu,
  Pagina de start, Despre mine, Întrebări frecvente, Blog, Subsol, SEO și
  firmă, Pagini legale. "Pagini legale" also takes the official ANPC SAL
  pictogram.
- [x] **The admin screens** at `/admin/content/[section]`: a side menu on a
  computer and a dropdown on a phone, one RO / EN switch per form with an
  English counter and "Tradu ce lipsește", unsaved-changes tracking, a leave
  guard and one Save. Long texts use a compact rich editor (paragraphs, bold,
  italics, lists, links), which closes **B6** for the home page and About.
- [x] **FAQs** (**B14**): a new question starts hidden, both languages go
  through the switch, she reorders by dragging or with the up and down
  buttons, and publishes each with a switch.
- [x] **Header, drawer and footer** read the menu labels from site content,
  falling back to today's. The name, the logo or both, as she chooses. The name
  goes home; on the home page it scrolls to the top (**I20**).
- [x] **Footer:** TikTok and LinkedIn (`lib/social.ts` accepts @name, a bare
  domain or a full address), the legal pages, and the ANPC SAL link or
  pictogram.
- [x] **Home and About read every text from site content.** Headings and
  buttons fall back to plain labels; "Explorează" is now "Vezi evenimentele".
  The invented headline and tagline are deleted, and her own words show a
  dashed placeholder named after the part while empty. The arrows stay.
- [x] **SEO (R6).** Page titles and descriptions come from her fields or are
  left out. The structured data names no town and no person unless she fills
  them in. The share card uses her tagline. `INSTRUCTOR_NAME` and
  `SITE_LOCALITY` are gone.
- [x] **Legal pages** at `/[locale]/privacy`, `/terms` and `/cookies`,
  drafted in both languages. `{{business_name}}` and the other facts fill in
  from her business details, and anything missing is a visible marker. Each
  page shows when it last changed. They are in the sitemap.
- [x] **[PRIVACY.md](PRIVACY.md):** the plain-language guide, what she must
  fill in, the defaults she must confirm, and what a lawyer should check.

**New migration**

- `20260925000000_faq_hidden_and_legal_drafts.sql`: `faqs.published`
  defaults to false, and the three legal drafts as site-content rows.

**Tests**

- `admin-content.spec.ts` (new): every section at its own address; one Save
  and the text on the site; a row created by its first save; the English
  reference and fallback; paragraphs kept (B6); the leave guard; a menu label
  in the header, drawer and footer together; each name/logo mode; TikTok and
  LinkedIn addresses; a new question hidden by default; create → publish →
  reorder → English.
- `legal-pages.spec.ts` (new): all three pages in both languages, with their
  date; missing facts as markers and supplied ones escaped; the VAT sentence;
  the footer links; the sitemap.
- `seo.spec.ts`: no town, person or description she did not supply, and hers
  when she does.
- `public-home.spec.ts`: the new button labels; the wordmark goes home.
- `admin-mobile.spec.ts`: the section dropdown on a phone.

**Found along the way**

- **PostHog set cookies.** The cookie policy says statistics run without
  them, so the one line that makes that true (`persistence: "memory"`) came
  forward from phase 11.
- **Embedded videos still load straight away** and may set their own cookies
  until phase 3 makes them click-to-play. PRIVACY.md says so.
- **The logo help suggested SVG**, which the uploader rejects on purpose. It
  now says PNG or WebP.

### Phase 3: Blog

- [x] **Toolbar:**
  - The code block goes. Inline code and underline stay.
  - Alignment becomes one dropdown, with left as the default.
  - Indent and outdent buttons appear for lists, replacing the Tab row in the
    cheat sheet.
  - The cheat sheet shows typed combinations as "## + Space".
  - Undo and Redo keep their English names in Romanian.
  - Buttons grow to 40 px (44 px on touch), with more space under the toolbar
    and a taller writing area.
  - The toolbar sticks while she scrolls (I26) and wraps cleanly on narrow
    screens, shortcuts button included.
  - The image button shows images only; audio and video had never worked
    there (B12).
- [x] **Link dialog:** an address plus "Text afișat" (text shown); an empty text
  shows the address itself. Editing a link shows its current text, there is a
  Remove link button, and `https://` is added when missing.
- [x] **Video:**
  - The tooltip and the dialog list exactly what works: YouTube videos and
    Shorts, Vimeo, Instagram posts and reels, and TikTok.
  - Maps and other sites are refused with an explanation.
  - One list in `lib/embeds.ts` feeds the editor, the sanitizer and
    testimonials.
  - Portrait embeds keep their shape (B34), and 4:5 posts are sized properly
    (B26).
- [x] **Tooltips paint above the text:** the toolbar becomes its own layer.
- [x] **One source for typography** (`lib/article-typography.ts`), used by both
  the public article and the editor.
  - It replaces `prose-sage`, which never existed.
  - H2 and H3 now use the title's weight.
- [x] **The post list** at `/admin/blog`:
  - Tabs with counts: Toate · Publicate · Ciorne · Ascunse.
  - Search across title, subtitle and slug, in both languages.
  - Sort by last edited (newest or oldest), publish date, or title.
  - Compact rows: thumbnail, title and subtitle, status, a marker for
    unpublished changes, and when it was last edited.
  - A readable width, 25 per page, and the whole state kept in the address.
  - It opens on the Ciorne tab when the dashboard's link says `?tab=drafts`.
- [x] **The editor** at `/admin/blog/new` and `/admin/blog/[id]`. The
  dashboard's "Articol nou" links there, and the `?new=1` stopgap
  (`lib/admin/use-new-from-link.ts`) goes.
  - **A sticky bar** with:
    - Back
    - the save status
    - RO / EN with the English count
    - Preview
    - Publică (Publish) / Publică modificările (Publish changes) /
      Publicat (Published)
    - a menu with Delete and Discard changes
  - **The fields:**
    - a cover image, or the first image in the article automatically
    - the title, set exactly like the public one
    - an optional subtitle
    - the slug, filled in from the title until the first publish, with a
      tooltip on its label saying what it is
    - the author, pre-filled from Site content
    - the Hidden switch, which works before publishing too
  - **Autosave.** Drafts save straight to the post. A published post saves into
    private changes. The post is created on the first non-empty edit. Going
    Back with every field empty deletes a post that was never published.
  - **Publish** checks the title, the slug and the content. It shows
    "Articol publicat" (Article published) with a link, and stays in the
    editor.
  - **Preview** opens the real public article, draft version, at phone or
    computer width, in RO or EN.
  - **No error closes the editor** (B5).
- [x] **The public blog.**
  - **Cards on the home page and `/blog`** show the cover, title, subtitle,
    date and reading time ("5 min de citit").
  - `/blog` is split into pages of 12.
  - **The article** has the cover, the title and subtitle, then a byline with
    the author, date and reading time.
  - The Share button sits under the title now, not beside it (B24).
  - Embedded videos wait for a click, and YouTube uses its no-cookie domain.

**How it turned out** (25 September 2026)

- **One migration, not two:** `20260926000000_blog_editorial.sql` holds the
  new columns, `content_drafts`, `publish_post_draft()` and the
  `published_at` trigger. It also makes the dashboard's draft count match the
  Ciorne tab (hidden posts are in Ascunse), and updates the cookie policy's
  sentence about videos where the draft is still unedited.
- **Spellcheck** is one on/off button; the language follows the RO / EN
  switch.
- **The editor's bar sticks on a computer only.** On a phone it scrolls away,
  because with the toolbar it covered half the screen.
- **Event descriptions** get the click-to-play videos too, since they share
  the sanitizer.
- **Found by the tests and fixed:** a pasted picture from an unknown host took
  the article and `/blog` down (`next/image`); the leave guard swallowed the
  editor's Back; a taken address went unnoticed on a live post.

**New migrations**

- `…_blog_editorial.sql`:
  - subtitle, cover, author, `published_at`
  - the first image and reading time, both computed by Postgres
  - a slug format check
  - drops the unused `media_urls`
- `content_drafts`: private changes to published posts and events. Admin-only,
  with explicit grants.

**Tests**

- `admin-blog.spec.ts` is rewritten: tabs, search and sort; autosave; an empty
  post discarded on Back; Publish stays in the editor; Hidden works;
  published edits stay private until "Publish changes"; Preview; the
  duplicate-slug error.
- `admin-blog-editor.spec.ts` is updated.
- `public-blog.spec.ts` is updated: cards, byline, Share position, pages.
- `sanitize.spec.ts` gains cases for click-to-play embeds and TikTok.

### Phase 4: Events

- [x] **The registration lifecycle in the database.**
  - A booking records its language, the participant's note and consent, her
    note, the marketing opt-in, and the refund-request, removal and reason
    fields.
  - The waiting list records its language and removal.
- [x] **One definition of "holds a seat" (`holds_seat`)** used by both the
  public seat count and the booking function. Removed rows no longer hold
  one.
- [x] **Bookings close when an event starts.** The booking function (B4) and
  the booking, waiting-list and claim routes all refuse.
- [x] **A seat taken first.** The waitlisted person sees the apology and stays
  first in line until the event ends.
- [x] **An admin overview of each event:**
  - its status: draft, upcoming, ongoing, ended-with-something-pending, or
    archived
  - seats taken out of capacity
  - the five numbers
- [x] **The admin list:**
  - Tabs: *Upcoming* (which also holds ongoing events, and ended events with
    something still pending), *Drafts* and *Past*.
  - Search and sort.
  - Rows show a thumbnail, schedule, status and seats.
  - The pending group sits where the waitlist button was: waitlist · payment
    pending · refund requested. The other two follow: offers awaiting reply ·
    refunded.
  - Each number opens Registrations filtered to that event.
  - The waitlist modal is removed.
  - *Upcoming* is the tab it opens on, which is what the dashboard's Evenimente
    row counts.
- [x] **The editor** uses the same frame as the blog editor, at
  `/admin/events/new` and `/admin/events/[id]`. The dashboard's "Eveniment
  nou" and its next-event panel link there. Its sections:
  - basics
  - when
  - where
  - price and places
  - photo, through the media library (I12)
  - description, in the rich editor (B6)
  - the WhatsApp group
  - whether the event appears in the past-events archive

  Once an event has ended, its date, price and places lock. Publishing
  changes that add places notifies the waiting list.
- [x] **The public site.**
  - `/events` lists upcoming events. Ongoing ones are marked "În desfășurare"
    (in progress) and can't be booked.
  - A "Evenimente trecute" (past events) archive follows, 12 per page. She can
    hide any event from it.
  - A past event's page says it has ended, shows no booking form, and lists
    that event's testimonials.
  - The share image no longer fails for events without a start time (B8):
    done early, in phase 0.

**How it turned out** (25 September 2026)

- **One migration**, `20260927000000_registration_lifecycle.sql`: the booking
  and waiting-list columns, `holds_seat()`, the rebuilt booking function (it
  refuses once the event has started and answers with a `code`), the seat
  view, the overview with each event's status and five numbers, the
  dashboard counting the Upcoming tab, and `publish_event_draft()`, which
  leaves an ended event's date, price and places alone.
- **Bookings close at the start**, and an event with no announced hour starts
  at midnight on its day, as Postgres already computes `starts_at`.
- **The editor shares the blog's autosave** (`lib/admin/use-autosave.ts`),
  moved out of the post editor unchanged. A new event saves once it has a
  title and a date. Preview is the real event page, with the booking panel
  drawn inert.
- **Registrations reads `?event=` and `?status=`**, so each number opens its
  people, the waiting list included, until phase 5 rebuilds the page.
- **Found along the way:** a claim that lost its seat told the person the link
  was invalid, and their unanswered offer went on counting as a promised seat,
  so the next seat was offered to nobody. They get an apology now, and first
  place.
- **Also done:** B6 for event descriptions (the rich editor) and I12's photo
  picker.

**New migrations**

- `…_registration_lifecycle.sql`: the columns above, `holds_seat`, the rebuilt
  booking function and seat-count view, and `admin_event_overview` (visible to
  the admin only).

**Tests**

- `admin-events.spec.ts` is rewritten.
- `public-events.spec.ts`: the archive, the ended page, and bookings refused
  after the start.
- `waiting-list-claim.spec.ts`: the apology keeps first place.
- `rpc-exposure.spec.ts` confirms visitors still reach nothing new.

### Phase 5: Registrations

- [x] **One participants list** at `/admin/registrations`, joining bookings and
  the waiting list:
  - Tabs: *Active* and *Archive*.
  - Search by name, email, phone or event.
  - Filters: free, paid, payment pending, refund requested, refunded,
    waitlist, offer sent, removed, and by event.
  - 50 per page.
  - It opens filtered when the address says so: `?status=pending` from the
    dashboard, `?event=<id>` from an event's numbers.
  - **Archiving rule.** A participant is archived when removed, or once their
    event has ended with nothing pending. Waiting-list entries archive when
    the event ends.
- [x] **The participant panel:**
  - contact details
  - status
  - the participant's note, with the date they consented
  - her note, which autosaves
  - their history: every event under the same email, with a count
  - **Actions:**
    - Mark refund requested / refunded, by hand until the Stripe phase.
    - **Remove participant.** The confirmation dialog shows the name and
      status, asks for a reason, and can email the participant. The seat is
      freed and the waiting list told if the event hasn't started.
- [x] **The archive.**
  - Select rows or everything matching the filters, then permanently delete
    after a yes/no confirmation.
  - The Events *Past* tab works the same way. Testimonials survive an event's
    deletion and keep its title.
- [x] **Export** to CSV (opens correctly in Excel, with Romanian letters intact
  and formula tricks disarmed) or Excel `.xlsx`. The library loads only when
  used. Health notes are never exported.
- [x] **The booking and waiting-list forms** gain:
  - an optional "Ceva ce ar trebui să știu?" (anything I should know?), with
    consent
  - an unticked marketing opt-in
  - a one-line privacy notice
  - the page language, now stored

  The duplicated free/paid code in the form is merged (R4).
- [x] **Emails go out in the booking's language** with readable dates (B15),
  and every send checks for errors (B9).
  - Locally and in tests, mail goes to the local mailbox instead of Resend
    (S6, email half).
- [x] **A daily job** (`vercel.json` cron calling `/api/cron/daily`, guarded by
  a secret):
  - clears notes 30 days after an event
  - removes abandoned unpaid bookings
  - expires old review links: **moved to phase 6**, which creates the links.

**How it turned out** (26 September 2026)

- **Two migrations.** `20260928000000_participants.sql`: the waiting list
  records the note, its consent, the opt-in and her note, like a booking;
  `register_for_event()` takes the moment of consent, so a note written on
  the waiting list keeps its date when the seat is claimed; the view
  `admin_participants` (one row per booking and per unclaimed waiting-list
  entry, with a status, `archived` and a search text); `admin_delete_participants()`,
  which skips anyone not archived; `daily_cleanup()`; two new email templates;
  and the privacy draft's new paragraphs. `20260928000100_testimonial_event_link.sql`
  keeps a testimonial when its event is deleted, with the title and date.
- **The list is filtered and paged by the database**, because it only grows.
  Search ignores accents, and a phone number is found however it is typed
  ("0722 111 222" finds "+40 722 111 222").
- **The panel has its own address** (`?p=<id>`): the back button closes it and
  a refresh keeps it open. On a phone it is the whole screen. Contact has a
  WhatsApp link beside email and phone.
- **Removing is "Anulează înscrierea"** for a booking and "Scoate de pe lista de
  așteptare" for a waiting-list entry; the reason is required and stays with
  her; the email (`booking_cancelled` / `waitlist_removed`, editable at
  /admin/emails) does not include it.
- **Excel export is a real workbook**, written by hand over fflate
  (`lib/admin/xlsx.ts`), because the libraries that wrap it compress in a
  Web Worker started from a `blob:` address, which the site's CSP refuses.
  Every cell is text. The CSV uses semicolons and a byte-order mark, and
  disarms formulas with an apostrophe.
- **Abandoned checkouts go after seven days**, not one hour: Stripe retries a
  webhook for up to three days, and a late "paid" must still find its booking.
- **Offers whose email failed are withdrawn**, so a seat is never held for
  someone who was not told. Recording offers only for sent emails in one
  locked step stays with B16 in phase 7.
- **Found along the way:** since phase 4 made event descriptions rich text,
  calendar entries carried the HTML tags; they are plain text with paragraphs
  now. Meta descriptions decoded only `&amp;` and `&nbsp;` (B28), fixed in the
  same function.
- **The privacy draft now keeps waiting lists as long as bookings** (it said
  until the event ends), because the archive keeps them. A retention period,
  hers to confirm.

**New migrations**

- `…_participants.sql` and `…_testimonial_event_link.sql`, above.

**Tests**

- `admin-registrations.spec.ts` is rewritten: search, filters from the
  address, the archive rule and its delete, select-all across pages, the
  panel, cancelling with an email, refunds, CSV and Excel.
- `booking-form.spec.ts` (new): the note needs consent, the opt-in and the
  language are stored, on both forms.
- `email-language.spec.ts` (new): English and Romanian confirmations, with
  readable dates, read from the local mailbox.
- `cron.spec.ts` (new): the secret, notes at 30 days and not before, and
  abandoned checkouts.
- `admin-events.spec.ts`: the Past tab's delete keeps the testimonial.
- `plain-text.spec.ts` (new): B28 and the calendar paragraphs.

### Phase 6: Testimonials and verified reviews

- [x] **The admin section.**
  - Tabs: *To approve*, *Approved*, *Hidden*, opened on *To approve* by the
    dashboard's `?tab=pending`.
  - Each card shows:
    - the full name
    - the event and its date
    - the participant's own rating
    - the text and photo
    - a video link she can attach
  - Actions:
    - Approve
    - Hide / Show (hidden from the home page and `/testimonials`)
    - an On the home page switch, with her own order (drag, or up/down
      buttons)
    - Delete with confirmation
  - The admin rating control is removed.
- [x] **Invitations.**
  - The morning after an event ends, eligible participants receive a personal
    link. Eligible means free or paid, not removed, and no refund requested
    or given.
  - An off switch lives in Site content, and ended events get a Send
    invitations button.
- [x] **The public site.**
  - The home page shows her selection in her order, with "Împărtășește-ți
    experiența" next to "Vezi toate testimonialele".
  - `/[locale]/testimonials/share` asks only for the booking email. It is
    protected against spam, answers the same whatever email is typed, and
    sends the link in the booking's language. If the event hasn't ended, the
    email says when they can write.
  - `/[locale]/testimonials/write?token=…` greets them by name. It asks for:
    - a star rating
    - the text (bold, italic and paragraphs; 2,000 characters)
    - the name to show (full, or first name and initial)
    - an optional photo, compressed as described above
    - an optional video link
    - consent to publish
- [x] **`/testimonials`:**
  - 12 per page
  - each testimonial shows its event title and photo
  - videos play only on click
  - a line saying testimonials come from verified participants (Omnibus)
- [x] **Security.**
  - Links are stored hashed, work once and expire after 60 days.
  - The daily job (`daily_cleanup()`, phase 5) deletes expired links.
  - Participants' text passes a strict sanitizer that allows paragraphs, bold
    and italic only. This closes S15 for public input.
  - `/api/testimonials` is deleted (R5).

**How it turned out** (28 September 2026)

- **One migration**, `20260929000000_reviews.sql`: the testimonial columns
  (the booking, photo, consent, language, hidden, the home page's selection
  and order, source), one testimonial per booking, the visitors' policy
  (approved and not hidden) and a grant on named columns only, the
  `review_invitations` table (the link's SHA-256, never the link), the daily
  job deleting lapsed links, the dashboard no longer counting hidden ones, a
  `review_too_early` email, and a paragraph on testimonials in the privacy
  draft.
- **A booking may hold several working links** (the morning email, her button,
  a request on the share page), and any of them writes the one testimonial the
  booking may have; the others then say it has been written.
- **The morning after** is the daily job: events that ended in the last three
  days, so a missed run is made up, and nobody is sent a second link.
- **Photos** are shrunk in the browser to 1600 pixels (a request over 4.5 MB
  never reaches Vercel's functions) and re-saved by the server as WebP with
  sharp, which drops all metadata, GPS included. `sharp` moved to the
  production dependencies.
- **Her controls are small on purpose:** approve, hide, the home page with
  arrows to order it, a video link, delete. The words, the stars and the name
  are the participant's, and a verified testimonial she could edit would not
  be one.
- **"Participare verificată"** marks only testimonials written through a link;
  older ones are "imported" and claim nothing. /testimonials says what the mark
  means (Omnibus).
- **With nothing chosen for the home page**, it shows the three newest, so the
  section does not vanish on the day testimonials start arriving.
- **Found along the way:** since phase 5 a testimonial outlives its event, and
  the tests that cleaned up by deleting their event were leaving testimonials
  on /testimonials. Their cleanup now deletes them.
- **Also:** analytics events no longer carry a link's token (`?token=`,
  `?claim=`); part of S10, ahead of phase 11.

**New migrations**

- `…_reviews.sql`:
  - testimonial columns for the registration, photo, consent, language,
    hidden, home selection and order, and source
  - visitors may read only the columns they need
  - `review_invitations`

**Tests**

- `public-reviews.spec.ts`: the whole path from request to approval; people
  who aren't eligible get no link; a reused link is refused; script injection
  is neutralised; the photo arrives as WebP without location data.
- `admin-testimonials.spec.ts` is rewritten.
- `cron.spec.ts`: invitations the morning after, once, and none when switched
  off; lapsed links deleted.
- `admin-events.spec.ts`: an ended event's invitations button.
- `public-testimonials.spec.ts` and `rpc-exposure.spec.ts`: hidden and pending
  ones stay private, and so do the columns that link a testimonial to a
  booking.

### Phase 7: Emails

- [x] **`/admin/emails`:**
  - every automatic email, with the moment it is sent
  - an editor with the RO / EN switch, subject and body (email-safe formats
    only)
  - placeholder chips inserted where the cursor is: name, event, date, place,
    link
  - a live preview in the real email layout, filled with data from the next
    event, at phone or computer width
  - "Trimite-mi un test", which sends a test to her
- [x] **One branded email layout:**
  - her name or logo at the top
  - her business name and address in the footer
  - replies go to her
  - From reads "flow4ward" (I13)
  - a plain-text version
- [x] **Announcements:**
  - written once in both languages
  - recipients chosen from Registrations, either the selected rows or a
    filter; only people who opted in are included, and the rest are listed
    as excluded
  - an event card can be inserted
  - a preview, then batch sending
  - an unsubscribe link and one-click unsubscribe
  - a history of what was sent
- [x] **B16.** Offering freed seats to the waiting list happens in one locked
  database step. Offers are recorded only for emails that actually sent (B9).

**How it turned out** (28 September 2026)

- **One layout for every email** (`lib/email-layout.ts`): her name or logo
  on the cream background above a white sheet, the message, her business name
  and address underneath, and the site's address. A paragraph holding only a
  link is drawn as a rose button, so each placeholder link she inserts on its
  own line becomes the email's one action. Tables and inline styles, so
  Outlook and Gmail draw it too. Every email has a plain-text version.
- **Lines with nothing to say are left out:** "Ora:" for an event with no
  hour yet, or the WhatsApp button for an event without a group.
- **The preview is the email.** The same functions fill and draw it in the
  browser as on the server, with the next event's details and "Ana Popescu"
  as the reader. "Trimite-mi un test" sends the text on screen, saved or not,
  to the address she signs in with, and only there.
- **Placeholders are chips** with plain names (Nume, Eveniment, Data, Ora,
  Locul, and each email's links), inserted at the caret; each field has its
  own row. The stored text still says `{{event_name}}`, so nothing that
  sends changed its format.
- **Announcements** start from the Registrations page (the rows ticked, or
  everyone matching the filter) or from "Anunț nou" (everyone who accepted).
  The editor says who will receive it and who is left out and why, before
  she sends. They go a hundred to a request to Resend; each person is marked
  sent or failed as it goes, so a send cut short carries on, and failed ones
  can be tried again. The report lists everyone.
- **Unsubscribing:** every announcement carries its own link and the
  `List-Unsubscribe` headers (RFC 8058), so Gmail and Apple Mail show their
  own Unsubscribe. The page the link opens changes nothing until its button
  is pressed, because mail scanners open every link, and the button is a
  plain form, working before any script loads.
- **B16:** `offer_waiting_list_seats()` counts, chooses and stamps under
  the lock on the event row that bookings take; six offers fired at once for
  two seats make two. `settle_waiting_list_offers()` withdraws the offers
  whose email failed and records only the ones sent (B9).
- **Found along the way:** subjects were escaped as HTML, so an event called
  "Yoga & brunch" arrived as "Yoga &amp; brunch"; and a confirmation for an
  event without a WhatsApp group ended in "Alătură-te grupului de WhatsApp:"
  and an empty link. Subjects are filled in as plain text now.

**New migrations**

- `20260930000000_email_system.sql`:
  - the `waitlist_joined` email, and the confirmations' WhatsApp line as a
    button where its text is still the original
  - `announcements`, `announcement_recipients`, `admin_announcements`
  - `email_suppressions`
  - `offer_waiting_list_seats()` and `settle_waiting_list_offers()`
  - `admin_participants` readable by the server
  - the privacy draft on unsubscribing and what is kept

**Tests**

- `admin-emails.spec.ts` is rewritten: the list in a booking's order,
  editing with chips and saving, the preview and a test in the local
  mailbox, leaving with changes, English falling back to Romanian, an
  announcement from Registrations to its report, deleting a draft, the reply
  address, and stopping announcements to one person.
- `announcements.spec.ts` (new): only opted-in people receive one, in their
  language; someone who unsubscribed is left out unless they opted in again;
  one-click unsubscribe; failed ones tried again and a stopped send carried
  on, without writing to anyone twice; nothing sent twice or without its
  Romanian text.
- `unsubscribe.spec.ts` (new, both engines): the page's button, a link that
  matches nobody, and no indexing.
- `email-layout.spec.ts` (new): escaping, the empty lines left out, the
  button, the card, the text version.
- `email-language.spec.ts`: the From name, Reply-To and text part; no empty
  WhatsApp line; the waiting-list confirmation.
- `waiting-list-release.spec.ts`: six offers at once for two seats, and
  batches recorded with how many went.

### Phase 8: Messages

- [x] **The inbox:**
  - Tabs: *Inbox* · *Starred* · *Archive*, with an Unread filter and search.
    The dashboard's `?filter=unread` opens the Inbox with the filter on.
  - Select one, many or all, then mark read or unread, star, archive or
    delete (with confirmation).
- [x] **The letter view.** On desktop the list and the letter sit side by
  side; on a phone the letter opens full screen.
  - The sender and subject are set in the serif typeface.
  - Line breaks are kept.
  - "Răspunde prin email" (Reply by email) is there, along with star, archive
    and delete.
  - Opening a message marks it read.
- [x] The contact form stores the visitor's language.

**How it turned out** (29 September 2026). The full suite passed on a
production build: 646 passed, 11 skipped, none failed.

- **The tabs are Primite, Cu stea and Arhivă.** Cu stea holds every starred
  message, archived or not, as a mail app's does; an archived one there says
  "Arhivat". Each tab counts what it would show with the current search and
  switch.
- **"Necitite" is a switch, not a fourth tab.** It narrows whichever tab is
  open and says how many unread messages that tab holds either way. The
  dashboard's link turns it on.
- **The database searches and pages**, 25 to a page, as it does for
  Registrations. The search reads the name, the address, the subject and the
  message, with or without accents: `search_text`, a column Postgres keeps
  itself.
- **The letter sits beside the list from 1280 px wide.** It sticks under the
  top bar and scrolls on its own, so a long list scrolls past it. Narrower, it
  covers the screen, with "Înapoi la mesaje" at the top, and it has its own
  address (`?m=<id>`), so the back gesture and a refresh work.
- **Opening marks it read, and the list follows.** With "Necitite" on, the
  message then leaves the list, while the letter stays open. "Marchează ca
  necitit" puts it back and closes the letter. Starring keeps the letter open;
  archiving, moving back to Primite and deleting close it.
- **"Răspunde prin email" opens her mail app** addressed to them, with
  "Re: <their subject>" and their message quoted underneath, since they wrote
  through a form and have no copy of it. The subject line and the quote's
  heading are in the language of the page they wrote from. Without a subject of
  their own, the reply's is "Mesajul tău către <her site's name>". A message
  too long for a mail link is quoted from the start and marked as cut.
- **The bar at the bottom** offers each tab's likeliest action first
  (Arhivează, Scoate steaua, Mută în Primite), "Mai multe" for the rest, and
  Șterge. "All N that match" means the ones she was shown: a message that
  arrives while she is choosing is not archived or deleted with them.
- **She can star a row** without opening it, so without marking it read.
- **The seed** has six messages to look at locally: two unread, one of them
  from the English site, one starred, one without a subject, two archived.

**New migration**

- `20261001000000_message_inbox.sql`: `contact_messages.search_text`,
  generated from the name, address, subject and message, lowercased and
  without accents. The table's grants and policy are unchanged, so visitors
  still reach nothing.

**Tests**

- `admin-messages.spec.ts` is rewritten (T4). It replaces a test that passed
  whatever the page showed. The new one covers:
  - the tabs and their counts, and an archived starred message
  - the switch from the dashboard's address
  - searching without accents, by address and by words in the text
  - starring a row without reading it
  - opening marks it read, and the dashboard's count follows
  - line breaks, and the serif for who and what
  - the reply in both languages
  - the letter's actions, and deleting only after a yes
  - a refresh keeping it open, and a message that is gone
  - "all 27 that match" leaving a newer one alone
  - English
- `admin-mobile.spec.ts`: on an iPhone the letter covers the screen, starts at
  the sender's name, and goes back to the list.
- `public-contact.spec.ts`: a message from `/en/contact` is stored as English,
  one from `/ro/contact` as Romanian, and anything else as Romanian.
- `admin-dashboard.spec.ts`: the messages row lands with "Necitite" on.

**Found along the way**

- **The events list counted events like people.** Its Trecute tab borrowed
  the Registrations wording, "Toți cei 12 … sunt selectați" and "Selectați:
  2". Romanian counts evenimente (and mesaje) as "Toate cele 12 … sunt
  selectate". Both lists now have their own words.
- **The Supabase CLI that `9b403e9` updated writes the database types
  differently.** They come out unformatted, so this phase's regeneration
  rewrote the whole of `lib/database.types.ts`. They also mark generated
  columns `never` on insert and update, so TypeScript now refuses the write
  CLAUDE.md warned about.
- **Nothing deletes old messages.** The privacy draft keeps them "until the
  conversation ends, at most a year", a default she has to confirm, as with
  bookings. Once she does, the daily job can enforce it. docs/PRIVACY.md says
  so.

### Phase 9: Public polish and speed

- [x] **Measure first.** Time the server work per page and compare the server
  and database regions.
- [x] ~~**Loading screens** with the lotus on list pages. They sit in route
  groups so `/blog/[slug]` and `/events/[slug]` still answer 404 for a
  missing page.~~ Replaced by the veil below, which covers every slow click on
  every page; the reasons are under "How it turned out".
- [x] **A veil** appears after 0.15 seconds on any slower click and blocks
  double taps.
- [x] **PostHog loads later,** and only on public pages (I19).
- [x] **View transitions:**
  - the breath fade on every page
  - the header stays still
  - event and post photos glide into their page
  - reduced motion respected
- [x] **The back-to-top button.**
- [x] **FAQ:**
  - the border fixed and checked in both browser engines
  - opening and closing animated, with a WebKit fallback
  - reduced motion respected
  - the stale comment about rich results corrected (I24)
- [x] **Blur** comes off static cards, buttons, inputs and the FAQ. It stays on
  the fixed header, drawers, dialogs, popovers, the sticky booking panel and
  the admin overlays.

**How it turned out** (29 September 2026). The full suite passed on a production
build: 700 passed, 11 skipped, none failed.

- **The wait was the ocean.** Vercel ran the site in Washington (`iad1`, its
  default) and the database is in Paris (`eu-west-3`), so every read crossed
  the Atlantic and back, and a page makes one to three rounds of reads, one
  after another. Measured from here on the live site: the home page took
  0.78–1.11 s to start answering, the others 0.38–0.63 s. A local build with
  85 ms added to every read showed the same pattern (0.13 s for one round,
  0.36 s for three). `vercel.json` now runs the site in Paris (`cdg1`), next to
  the database; it applies from the next deployment. PostHog was not part of
  the wait.
- **Reading in parallel.** The home page reads in two rounds instead of three,
  and an ended event's page in two instead of three. The seats on the events
  list and on an event's page need the events first, so those stay two.
- **No loading screens; the lotus lives in the veil.** Once React shows a
  loading screen it holds it for at least 0.3 s, so with the server beside the
  database every click to a list would have been slower with one than
  without. A loading screen would also have made `?page=999` answer 200, and
  it could never cover an event or a post. The veil covers every slow click:
  nothing for 0.15 s, then the page washes pale and stops taking taps, and at
  0.45 s a lotus, seen from above, turns while a wave of rose runs round its
  petals. The top bar stays above the veil. With less motion the lotus stops
  turning and the wave slows.
- **The breath and the glide.** The page being left fades out and the new one
  rises in, in about a third of a second, under a top bar that does not
  move; an event's or a post's photograph glides from the card to the top of
  its page. Back, forward and an iPhone's swipe change the page in one frame,
  because the browser has already shown the other page by then. With less
  motion, nothing animates.
- **"Înapoi sus"** appears once the first screen has scrolled away and comes
  and goes with the top bar, so it never sits on the corner of the page while
  she reads down it. It glides to the top, or jumps with less motion, and
  hands keyboard focus to the start of the content.
- **The FAQ** has a plain frame now: no blur, nothing clipped, and a hairline
  as strong as the frame. An answer unfolds and folds back in 320 ms, in CSS
  on Chromium and through a small script on Safari and Firefox, and is simply
  there with less motion. Answers keep the line breaks she types. The comment
  claiming Google shows the questions as rich results says what is true now
  (I24).
- **Blur:** off every card, button, input and the FAQ, and off the admin's
  sign-in card; on the top bar, "Înapoi sus", the sticky booking panel, the
  dialogs and the admin's sticky bars and overlays. `GlassCard` blurs only
  when told it floats.
- **PostHog** is rendered by the public layout alone, fetched once the page has
  loaded and gone quiet, and never loaded on localhost, so local runs and the
  test suite no longer count as her visitors (the local half of S6, ahead of
  phase 11).

**Tests**

- `transitions.spec.ts` (new):
  - the veil on a slow navigation: it waits, takes the taps and leaves with
    the new page
  - no veil for a link to the same page or to another site
  - the photograph's glide and the page's breath, and a still top bar
  - back and forward without a transition
  - less motion: nothing moves, and the lotus stops turning
  - missing pages still answer 404
- `faq.spec.ts` (new): an answer unfolds and folds back, or appears at once
  with less motion, in each engine's own way; line breaks; the frame.
- `back-to-top.spec.ts` (new): the first screen, going with the top bar, the
  glide and the focus, a short page, less motion.
- `analytics.spec.ts` (new): the public layout alone renders it, the library
  is fetched rather than bundled, and a local page sends it nothing.
- `ui-consistency.spec.ts`: every file allowed to ask for a blur is listed,
  and cards, buttons, fields and the FAQ are checked without one while the top
  bar and the booking panel keep it.

**Found along the way**

- **WebKit crashes on the usual way to hide a transition's old picture.**
  `::view-transition-old(...) { display: none }`, which the Next.js guide uses
  for a still header, takes the whole page down in WebKit when anything asks
  for the page's animations while the transition runs. Reproduced on a bare
  page, three crashes in three. The site makes the picture invisible instead.
- **Playwright's WebKit does not draw view transitions** in its screenshots or
  videos, although it runs them: the animations are all there in
  `document.getAnimations()`. The motion was checked by eye in Chromium; on an
  iPhone it is worth a look on the preview.
- **A transition's pictures are not clipped.** Cropped from 3:2 to 16:9, the
  card's photograph showed its cut-off part as a pale box around the frame
  until the pair was clipped.
- **FAQ answers lost their line breaks** on the page, as event descriptions
  once did (B6).
- **`GlassCard`'s comments** described admin tiles and rows it no longer draws,
  and a test bound of 1.025 that the test had already tightened to 1.021.
- **Phase 8's letter test on the phone could measure mid-slide.** It read the
  dialog's position without waiting for its 220 ms slide, and one full run
  caught it 3 px from the edge. It waits for the slide to finish now.

### Phase 10: Stripe

- [ ] **The remaining payment fixes:**
  - B2: confirmation after paying
  - B3: duplicate bookings, once Rares sets the rule
  - B10: partial refunds
  - B11: checkout accepting registrations in the wrong state
  - T1: webhook tests with signed events
  - T2
- [ ] **A self-service "cancel / request refund" link** in confirmation emails.
- [ ] **Promotion codes** for announcements.

### Phase 11: PostHog

- [ ] **Where and how it runs:**
  - public pages only
  - no cookies
  - the EU host
  - loaded late
  - never on `localhost` or with development keys (S6)
- [ ] **Private tokens stripped:** waiting-list and review tokens are removed
  from recorded addresses (S10).
- [ ] **Events tracked:** event views, booking clicks and blog reads.

---

## Needs Rares

- **Approval before every commit,** starting with the 23 September editor
  work.
- **Facts for the legal pages:**
  - her legal form and name
  - her registration number (CUI)
  - her registered address
  - the email address for privacy requests
  - her VAT status
- **Business decisions:** cancellation and refund windows, and how long to keep
  bookings. The drafts suggest defaults.
- **Her name as search engines should show it,** and the area she serves if she
  wants one published.
- **Where the server and database run:** answered in Phase 9, nothing to look
  up. They were apart (Vercel in Washington, Supabase in Paris), and
  `vercel.json` now runs the site in Paris from the next deployment. On a
  preview, the `x-vercel-id` response header should name `cdg1` as its second
  region.
- **The page transitions on an iPhone,** on the preview: Playwright's WebKit
  runs them but does not draw them in its screenshots.
- **Vercel settings:**
  - Phase 5: add a `CRON_SECRET` environment variable (a random string of at
    least 16 characters). Until it is set, the daily job refuses to run.
  - Phase 7: a verified sending domain and From address in Resend
    (`RESEND_FROM_EMAIL`). Its name does not matter: emails go out under the
    site's name.
- **Her address for replies** in Conținut site → Email-uri (or the address
  for personal data requests in Pagini legale). Until one is filled in,
  replies go to the sending address.
- **Before merging to `main`:** run `npx supabase migration list --linked`,
  then `npx supabase db push` for the new migrations.
- **B3:** one seat per email per event, or may someone book for a friend?
- **Phase 11:** a PostHog project on the EU cloud.

---

## For the polish pass

Rares' plan, 28 September: build every phase and test it locally first, then
check, tweak and polish the whole together, with her. Anything built so far
may change to fit how she works. The production steps under "Needs Rares"
wait for that pass too, unless Rares decides to do them sooner.

Noted so far:

- **"Testimonial: prea devreme" may go.** Rares finds the email redundant:
  someone who asks for their link before the event has ended could be told
  so on the page. The catch is "The share page gives one answer to every
  email" in DECISIONS.md: a page that answered "wait until your event has
  ended" would tell anyone who typed an address that its owner has a
  booking. A sentence on the share page, the same for everyone, saying when
  a link can be asked for keeps both, and a request that comes too early then
  sends nothing.
- **Fewer emails if she takes Resend's free plan.** It caps what can be sent
  per day and per month, and every email counts against it: confirmations,
  the waiting list, testimonial invitations and announcements alike. The
  Phase 7 emails stay for now. Then: count what one booking sends from start
  to finish, and check on a preview what an announcement larger than a day's
  allowance does.

---

## Working agreements for this overhaul

- **Comments say what the code does,** and why when that isn't obvious. The
  history goes in JOURNEY.md, not in the code.
- **Every new table states what each role may do** in the migration that
  creates it, and `tests/rpc-exposure.spec.ts` still lists everything a
  visitor can reach.
- **Every screen is checked on a phone-sized WebKit window** as well as desktop
  Chromium, with screenshots, before a phase is called done.
- **Nothing is ticked until a test proves it.**
