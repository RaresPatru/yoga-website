# Content needed from the instructor

Everything on this list is a placeholder on the site until she fills it in.
Each gap is marked with a dashed outline, named after the part it stands for
("Titlu principal", "Portret"), so nothing is silently missing: the gaps are
visible by visiting the site.

None of it needs a developer. All of it is in the admin under **Conținut
site**, one section at a time; each field says under it what the site shows
while it is empty.

> **Why the site does not just invent something plausible.** It used to. The old
> home page announced "10+ years · 500+ classes · 1000+ students", numbers no
> one supplied and no one checked, and until 25 September 2026 the home page
> fell back to a headline and tagline written for her ("Îți ghidez călătoria
> către echilibru"). Invented words on a page whose entire job is to earn trust
> are worse than a visible gap, because a gap gets filled and a polished
> invention does not. Headings and buttons still fall back to plain labels
> ("Vezi toate evenimentele"), which are directions rather than claims.

---

## Priority 1: before showing the site to anyone

People choose a **teacher**, not a studio: her face, her story and her name are
what turn a visitor into a booking.

| What | Section | Notes |
|---|---|---|
| **A photograph of her** | Pagina de start → Fotografia principală | Portrait orientation, at least 1200×1600px. Add a one-sentence description too. |
| **The main heading and subheading** | Pagina de start → Primul ecran | The first words anyone reads. |
| **Two or three sentences about her** | Pagina de start → Cine sunt | First person: what she hosts and who it is for. |
| **Her story** | Despre mine → Povestea ta | How she came to yoga, what shaped her, how she works. |
| **Her legal details** | Pagini legale → Datele firmei | Needed by the privacy policy and the terms. See [PRIVACY.md](PRIVACY.md). |

## Priority 2: completes the picture

| What | Section | Notes |
|---|---|---|
| Portrait for the About page | Despre mine → Portret | A second photo is better than repeating the first. |
| Training and certifications | Despre mine | Only what is real. Left off the page while empty. |
| Social networks | Rețele sociale | Instagram, Facebook, TikTok, LinkedIn. Each icon appears once filled in. |
| Logo | Identitate | Optional. She chooses whether the top bar shows the name, the logo or both. |
| Tagline and description | SEO și firmă | What Google and shared links show. Without them, the site name alone. |
| Her name for search engines | SEO și firmă | Optional. Without it, no person is named in the structured data. |
| The ANPC SAL pictogram | Pagini legale | The official 250×50 image from anpc.ro. A text link stands in until then. |

## Priority 3: reduces hesitation before booking

**Frequently asked questions** in **Conținut site → Întrebări frecvente**. A new
question stays hidden until she ticks "Publicată pe site" and saves.

The practical worries are what stop someone completing a booking, and they are
also what people type into Google. A starting set:

- Sunt începătoare — pot să vin?
- Ce trebuie să aduc cu mine?
- Unde au loc evenimentele exact?
- Ce se întâmplă dacă nu pot ajunge?
- Este nevoie de saltea proprie?

**Testimonials** in the admin's Testimoniale section. Phase 6 of the overhaul
replaces this with verified reviews from participants.

---

## Image guidance

- **Hero and portrait:** portrait orientation, at least 1200×1600px.
- **Event images:** landscape, at least 1600×900px.
- **Logo:** PNG or WebP with a transparent background, wider than tall.
- **Format:** JPEG, PNG or WebP. SVG is deliberately rejected by the uploader:
  an SVG is a document that can contain scripts, which is unsafe to serve from
  a public bucket.
- **Size limit:** 50 MB, enforced by the storage bucket itself.
