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
| 5 | Registrations: one list with the waiting list, archive, notes, exports | not started |
| 6 | Testimonials and verified reviews | not started |
| 7 | Emails: editor, preview, test sends, announcements | not started |
| 8 | Messages: unread, starred, archive, letter view | not started |
| 9 | Public polish and speed: loader, transitions, FAQ, blur, back to top | not started |
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
- [ ] **Each row opens its list already filtered.** The links carry their filter
  now (`?status=pending`, `?filter=unread`, `?tab=pending`,
  `?tab=drafts`). Each list applies it when its own phase rebuilds it, and
  those phases list it.

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

- [ ] **One participants list** at `/admin/registrations`, joining bookings and
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
- [ ] **The participant panel:**
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
- [ ] **The archive.**
  - Select rows or everything matching the filters, then permanently delete
    after a yes/no confirmation.
  - The Events *Past* tab works the same way. Testimonials survive an event's
    deletion and keep its title.
- [ ] **Export** to CSV (opens correctly in Excel, with Romanian letters intact
  and formula tricks disarmed) or Excel `.xlsx`. The library loads only when
  used. Health notes are never exported.
- [ ] **The booking and waiting-list forms** gain:
  - an optional "Ceva ce ar trebui să știu?" (anything I should know?), with
    consent
  - an unticked marketing opt-in
  - a one-line privacy notice
  - the page language, now stored

  The duplicated free/paid code in the form is merged (R4).
- [ ] **Emails go out in the booking's language** with readable dates (B15),
  and every send checks for errors (B9).
  - Locally and in tests, mail goes to the local mailbox instead of Resend
    (S6, email half).
- [ ] **A daily job** (`vercel.json` cron calling `/api/cron/daily`, guarded by
  a secret):
  - clears notes 30 days after an event
  - removes abandoned unpaid bookings
  - expires old review links

**New migrations**

- `…_testimonial_event_link.sql`: deleting an event no longer deletes its
  testimonials, which keep the event's title.

**Tests**

- `admin-registrations.spec.ts` is rewritten.
- `booking-form.spec.ts` (new).
- `email-language.spec.ts`: an English booking gets an English email.
- `cron.spec.ts`: notes are cleared, and a call without the secret is refused.

### Phase 6: Testimonials and verified reviews

- [ ] **The admin section.**
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
- [ ] **Invitations.**
  - The morning after an event ends, eligible participants receive a personal
    link. Eligible means free or paid, not removed, and no refund requested
    or given.
  - An off switch lives in Site content, and ended events get a Send
    invitations button.
- [ ] **The public site.**
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
- [ ] **`/testimonials`:**
  - 12 per page
  - each testimonial shows its event title and photo
  - videos play only on click
  - a line saying testimonials come from verified participants (Omnibus)
- [ ] **Security.**
  - Links are stored hashed, work once and expire after 60 days.
  - Participants' text passes a strict sanitizer that allows paragraphs, bold
    and italic only. This closes S15 for public input.
  - `/api/testimonials` is deleted (R5).

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

### Phase 7: Emails

- [ ] **`/admin/emails`:**
  - every automatic email, with the moment it is sent
  - an editor with the RO / EN switch, subject and body (email-safe formats
    only)
  - placeholder chips inserted where the cursor is: name, event, date, place,
    link
  - a live preview in the real email layout, filled with data from the next
    event, at phone or computer width
  - "Trimite-mi un test", which sends a test to her
- [ ] **One branded email layout:**
  - her name or logo at the top
  - her business name and address in the footer
  - replies go to her
  - From reads "flow4ward" (I13)
  - a plain-text version
- [ ] **Announcements:**
  - written once in both languages
  - recipients chosen from Registrations, either the selected rows or a
    filter; only people who opted in are included, and the rest are listed
    as excluded
  - an event card can be inserted
  - a preview, then batch sending
  - an unsubscribe link and one-click unsubscribe
  - a history of what was sent
- [ ] **B16.** Offering freed seats to the waiting list happens in one locked
  database step. Offers are recorded only for emails that actually sent (B9).

**New migrations**

- `…_email_system.sql`: new template types, the suppression list and the
  announcement history. Admin-only.

**Tests**

- `admin-emails.spec.ts` is rewritten: edit, preview, and a test email in the
  local mailbox.
- `announcements.spec.ts`: only opted-in recipients get an email, the
  unsubscribe works, and suppressed addresses get nothing.

### Phase 8: Messages

- [ ] **The inbox:**
  - Tabs: *Inbox* · *Starred* · *Archive*, with an Unread filter and search.
    The dashboard's `?filter=unread` opens the Inbox with the filter on.
  - Select one, many or all, then mark read or unread, star, archive or
    delete (with confirmation).
- [ ] **The letter view.** On desktop the list and the letter sit side by
  side; on a phone the letter opens full screen.
  - The sender and subject are set in the serif typeface.
  - Line breaks are kept.
  - "Răspunde prin email" (Reply by email) is there, along with star, archive
    and delete.
  - Opening a message marks it read.
- [ ] The contact form stores the visitor's language.

**Tests**

- `admin-messages.spec.ts` is rewritten, replacing a test that proved nothing
  (T4).

### Phase 9: Public polish and speed

- [ ] **Measure first.** Time the server work per page and compare the server
  and database regions.
- [ ] **Loading screens** with the lotus on list pages. They sit in route
  groups so `/blog/[slug]` and `/events/[slug]` still answer 404 for a
  missing page.
- [ ] **A veil** appears after 0.15 seconds on any slower click and blocks
  double taps.
- [ ] **PostHog loads later,** and only on public pages (I19).
- [ ] **View transitions:**
  - the breath fade on every page
  - the header stays still
  - event and post photos glide into their page
  - reduced motion respected
- [ ] **The back-to-top button.**
- [ ] **FAQ:**
  - the border fixed and checked in both browser engines
  - opening and closing animated, with a WebKit fallback
  - reduced motion respected
  - the stale comment about rich results corrected (I24)
- [ ] **Blur** comes off static cards, buttons, inputs and the FAQ. It stays on
  the fixed header, drawers, dialogs, popovers, the sticky booking panel and
  the admin overlays.

**Tests**

- `transitions.spec.ts`: the veil on a slow navigation; missing pages still
  return 404.
- `ui-consistency.spec.ts` is updated.
- Back to top and the FAQ are tested with and without reduced motion.

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
- **Where the server and database run:**
  - the region under Vercel → Project → Settings → Functions → Function Region
  - the region under Supabase → Project Settings → General

  If they differ, pages wait longer than they need to.
- **Vercel settings:**
  - Phase 5: add a `CRON_SECRET` environment variable.
  - Phase 7: a verified sending domain and From address in Resend.
- **Before merging to `main`:** run `npx supabase migration list --linked`,
  then `npx supabase db push` for the new migrations.
- **B3:** one seat per email per event, or may someone book for a friend?
- **Phase 11:** a PostHog project on the EU cloud.

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
