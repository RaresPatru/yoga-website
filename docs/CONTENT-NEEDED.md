# Content needed from the instructor

Everything on this list is a placeholder in the live site right now. Each one is
marked with a dashed outline on the page, so nothing here is silently missing —
you can see the gaps by visiting the site.

None of it needs a developer. All of it is editable at **`/admin/content`**.

> **Why the site does not just invent something plausible.** It used to. The old
> home page announced "10+ years · 500+ classes · 1000+ students" — numbers no
> one supplied and no one checked. Invented credentials on a page whose entire
> job is to earn trust are worse than a visible gap, because a gap gets filled
> and a polished lie does not. There is now a test that fails if those numbers
> reappear.

---

## Priority 1 — before showing the site to anyone

These three carry the most weight. Research on this kind of site is consistent
that people choose a **teacher**, not a studio: her face, her story, and her
name are what convert a visitor into a booking.

| What | Where it appears | Field in `/admin/content` | Notes |
|---|---|---|---|
| **A photograph of her** | Home page hero | `home.hero_image` | Portrait orientation. Teaching or a relaxed portrait — not stock. Min 1200×1600px. |
| **Two or three sentences about her** | Home page, under "Cine sunt" | `home.intro` | First person. What she teaches and who it is for. |
| **Her story** | About page | `about.body` | The longest piece here. How she came to yoga, what shaped her, how she works. |

## Priority 2 — completes the picture

| What | Where | Field | Notes |
|---|---|---|---|
| Portrait for the About page | About page | `about.portrait` | Can be the same photo as the hero, but a second one is better. |
| Training and certifications | About page | `about.credentials` | Only what is real. Course names, teachers, years. |
| Home page headline | Home hero | `home.hero_title` | Optional — falls back to "Îți ghidez călătoria către echilibru". |
| Home page subtitle | Home hero | `home.hero_subtitle` | Optional — falls back to "Yoga pentru corp, minte și suflet". |
| About page title | About page | `about.title` | Optional — falls back to "Despre mine". |
| Instagram link | Footer | `contact.instagram_url` | The footer icons currently link to `#`. |
| Public email address | Footer | `contact.email` | |

## Priority 3 — reduces hesitation before booking

**Frequently asked questions** — added at `/admin/content`, at the bottom.

These matter more than they look. The practical worries are what stop someone
completing a booking, and they are also the phrases people type into Google, so
they bring in visitors who have never heard of her. Suggested starting set:

- Sunt începătoare — pot să vin?
- Ce trebuie să aduc cu mine?
- Unde au loc evenimentele exact?
- Ce se întâmplă dacă nu pot ajunge?
- Este nevoie de saltea proprie?

**Testimonials** — added at `/admin/testimonials`.

- Text testimonials now carry a **name** and an optional **1–5 rating**. Leave
  the rating blank if she did not ask for one; no stars are drawn rather than
  assuming five.
- **Video testimonials work now** and are worth asking for. They are reported
  consistently as the highest-converting form of social proof for workshops and
  retreats. A 20–30 second phone clip is plenty.

---

## Still hardcoded, needs a decision rather than a form

**The business name.** The site currently says "Yoga Flow" everywhere — a
placeholder from the original build. When she chooses a name, it is a one-line
change in `lib/site-config.ts` (`SITE_NAME`), which updates the header, footer,
page titles, share cards and structured data together.

`INSTRUCTOR_NAME` in the same file should become her actual name; it is used in
the About page's structured data, which is what tells Google who runs this
business.

---

## Image guidance

- **Hero and portrait:** portrait orientation, at least 1200×1600px.
- **Event images:** landscape, at least 1600×900px.
- **Format:** JPEG or WebP. SVG is deliberately rejected by the uploader — an
  SVG is a document that can contain scripts, which is unsafe to serve from a
  public bucket.
- **Size limit:** 50 MB, enforced by the storage bucket itself. Uploads go
  straight from the browser to storage, so large files are no longer a problem.
