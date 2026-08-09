# Research findings

What research into yoga and wellness sites says, filtered to what applies to
**this** project. Last reviewed August 2026.

## The constraints that decide everything

Three facts about this specific business, which is why most generic advice about
"yoga studio websites" does not apply:

1. **She runs events, not classes.** No recurring timetable, no memberships, no
   class packs. Occasional collaborations with other practitioners — creative
   writing, journaling — but she is the only instructor.
2. **Instagram is the entire marketing channel.** Practically every visitor
   arrives by tapping a link she posted, on a phone, often inside Instagram's
   own in-app browser. The site is a link-in-bio destination first and a search
   result second.
3. **The audience is women**, mostly Romanian, booking something personal.

Anything below is included because it survives those three constraints.

---

## What actually converts

### People book a teacher, not a studio

The single most consistent finding across every source. Visitors choosing a yoga
teacher are choosing a person: her face, her training, why she teaches. Generic
studio photography and third-person copy actively hurt.

**Consequences for this build:** the home page leads with her photograph and her
own words; the About page is the second most important page on the site; both are
editable by her so they stay current.

### Video testimonials outperform everything else

Repeatedly cited as the highest-converting form of social proof for workshops and
retreats. A short phone clip beats a paragraph of text.

**Consequence:** the `testimonials` table always had a `video` type, but both
pages rendered the URL as quoted text. Video now plays. Ratings are optional and
draw no stars when absent — the previous five-hardcoded-stars on every quote was
fabricated proof that undermines the genuine reviews beside it.

### Practical questions are what stall a booking

"What should I bring?", "I've never done yoga — is that okay?", "What if I can't
make it?". FAQs are consistently identified as the thing that removes the last
hesitation on a booking page. They also match how people phrase Google searches,
so they bring in visitors who have never heard of her.

**Consequence:** an FAQ section she maintains herself, built on native
`<details>` so the answers exist in the HTML for search engines even while
collapsed.

### Booking friction is the conversion killer

Manual booking ("message me to reserve") loses people. Expected in 2026: pick,
fill in three fields, pay, done. Guest checkout, no account.

**Already in place and now actually working:** capacity indicators, a
fully-booked state, a waiting list, phone validation with country codes, CAPTCHA,
and a confirmation email with a calendar invite.

---

## Instagram-specific, which most guidance misses

- **Instagram does not expand links into preview cards inside stories.** A
  1200×630 Open Graph image — the standard advice — is useless there. What she
  needs is a **1080×1920 image she can post**. The site generates one per event
  and per article, from the event's real data, so a rescheduled event cannot be
  advertised with an outdated date.
- **The in-app browser is a WKWebView on iOS.** It behaves like Safari, not
  Chrome. This is not theoretical: a Content Security Policy directive that
  Chromium quietly ignores for local addresses broke the entire event page on
  WebKit during this build. Testing on one engine is testing one engine.
- **Reels are 9:16.** Embeds hardcoded to 16:9 letterbox them badly. Instagram
  also only renders inside a frame at its `/embed` path — a pasted post URL
  renders nothing at all.
- **Link previews still matter off-Instagram**, because links get forwarded to
  WhatsApp, which is where Romanian group coordination happens.

---

## Search

For a local, events-based business the highest-value structured data is `Event`:
it makes a listing eligible for Google's event results, showing the date and
location directly in search. Then `LocalBusiness` (which connects the site to a
Google Business Profile and to "yoga in Cluj" style searches), `Article` for
posts, `Person` for the About page, and `FAQPage`.

Structured data is not a ranking boost. It decides how a listing *appears*, and
whether it qualifies for richer formats — which is where the click-through
difference comes from.

A caution that applies directly here: **content rendered only in the browser does
not exist for a crawler.** The event page was a client component, so its title,
date, price and location appeared nowhere in the HTML. Fixing that mattered more
than any amount of markup.

---

## Visual direction

The 2026 wellness convention — sage green, terracotta and cream, organic shapes,
soft rounded type, botanical photography, restrained scroll animation — matches
what was already here. The palette was kept.

What was wrong was not the hues but how they were used. One pastel per colour was
doing every job, and a pastel that works as a background wash is unreadable
behind white text: the primary button measured **2.08:1** against a 4.5:1
requirement. Each colour now has a decorative role and an interactive role.

Deepening the rose had an unexpected benefit: `#E8A0B4` is the exact bubblegum
pink of every wellness template, while the accessible `#A94E67` reads as dried
rose — calmer, and less obviously templated.

**Mobile layout note learned the hard way:** a 3:4 portrait at full mobile width
is over 500px tall. Leading with it meant a visitor saw a screen of photograph
before learning what the site was. The headline now comes first on narrow
screens, the photograph second; the desktop layout is unchanged.

---

## Deliberately rejected

| Idea | Why not |
|---|---|
| Newsletter / lead magnet | Ruled out by the instructor. Nothing to send yet, and an unused signup form is worse than none. |
| Looping background video | Heavy on mobile data, and this audience is on phones. |
| Class timetable / booking platform (Mindbody, Momoyoga) | Built for recurring classes. She runs occasional events; the existing Stripe flow fits better and costs nothing. |
| Multiple instructor profiles | She is the only instructor. Collaborators are per-event, not permanent. |
| Google Reviews embed | Requires an established Business Profile; revisit once there is one. |
| Blog view counts | PostHog already covers this, and it is for her, not for visitors. |
| Star ratings on every testimonial | Only where someone actually gave one. Uniform five stars reads as invented and devalues the real ones. |

---

## Sources

- [Komodo Media — yoga studio website design, 2026](https://www.komodomedia.co.uk/2026/04/05/yoga-studio-website-design-12-examples-and-best-practices-for-2026/)
- [Google — LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Wellness Creatives — retreat marketing](https://www.wellnesscreatives.com/retreat-marketing-ideas/)
- [The Cultivators — story-driven yoga site case study](https://thecultivators.ca/yoga-website-design-case-study-ottawa/)
- [htmlBurger — yoga website examples](https://htmlburger.com/blog/yoga-websites-examples/)
