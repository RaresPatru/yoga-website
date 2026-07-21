# Yoga Website Research — Relevant Findings

## Design Patterns

| Pattern | Prevalence | Applies Here? |
|---------|-----------|---------------|
| **Minimalist + generous whitespace** | ~80% | ✅ Already using |
| **Soft pastel palettes (sage, terracotta, cream, rose)** | ~70% | ✅ Matches current palette |
| **Authentic photography (no stock)** | ~90% cited as critical | ✅ For real content phase |
| **Rounded corners + soft shadows** | ~60% | ✅ Already using glass cards |
| **Card-based layouts** | ~50% | ✅ Already using |
| **Looping background video** | ~25% | ❌ Too heavy, skip |
| **Hand-drawn / custom illustrations** | ~10% | ✅ Could add for branding |

## Homepage Structure (convergent across sources)

1. **Hero** — Single image/video + tagline + one primary CTA (`Explorează`)
2. **Intro/Mission** — 2-3 sentence "who you are"
3. **Events** — Upcoming events with availability indicators
4. **Testimonials** — Photo + name + star rating
5. **Newsletter signup** — Lead magnet (e.g., "Beginner's Guide")
6. **Footer** — Social links, location, contact

## Mobile Patterns

- **Sticky CTA button** on scroll (mobile-only) — shows only when open events exist
- Thumb-friendly (44×44px min tap targets)
- Click-to-call in header

## Booking Flow Patterns

- **Minimal steps**: select event → fill name/email/phone → submit
- **Capacity indicators**: "X/Y spots filled", "Fully booked" badge
- **Waiting list** when full
- **CAPTCHA** on registration (bots)
- **Phone validation** with country code
- **Confirmation email** with branded details
- **Guest checkout** (no account required)

## Social Proof Patterns

- Testimonial carousel with photos + star ratings
- Google Reviews embed (future)
- "As seen in" / press logos (future)

## Admin Dashboard Patterns

| Feature | Source | Apply Here? |
|---------|--------|-------------|
| Dashboard KPIs (registrations, revenue, event counts) | Dash SaaS, TechFit | ✅ Add to admin dashboard |
| Registration list with search/filter | Dash SaaS | ✅ Already have |
| Waiting list management | Quick Elements | ✅ Build now |
| Blog analytics (views per post) | Multiple | ❌ PostHog covers this |

## Email Automation Patterns

- Confirmation emails with calendar invite (.ics) | ✅ Already have
- Waiting list notification when spot opens | ✅ Build now
- Lead magnet / newsletter signup | ✅ Future (Phase 6)

## Key Takeaways for Our Project

1. **Sticky "Book Now" button** (mobile-only, conditional on available events) — high impact, low effort
2. **Capacity display + waiting list** — solves real problem for capped events
3. **Phone input with country code** — professional, reduces invalid entries
4. **CAPTCHA** — prevents bot registrations on free events
5. **Admin dashboard KPIs** — registration counts, waiting list size, revenue
