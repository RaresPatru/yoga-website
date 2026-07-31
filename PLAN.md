> **IMPORTANT INSTRUCTION:** Before every major action (making a change, running a command, starting a new phase), re-read this file. After completing a phase, update the status. Log all errors. This file is the persistent source of truth — the model's memory can be pruned, but this file survives.

# Project Plan

## Goal
A responsive yoga website for a female instructor with blog, paid/free event registration via Stripe, email confirmations with calendar invites, testimonials, admin dashboard, and analytics — deployed on Vercel.

## Current Phase
Phase 8 (complete) → Phase 7 remaining items

## Phases

### Phase 1: Project Scaffolding
- [x] Initialize Next.js with Tailwind + all dependencies
- [x] Set up directory structure and i18n routing
- [x] Create theme, fonts, base UI components
- **Status:** complete

### Phase 2: Supabase Backend + Admin Pages
- [x] Write SQL migration (tables, RLS, indexes, storage)
- [x] Build admin CRUD: blog (TipTap), events, registrations, testimonials, emails, messages
- [x] Wire Supabase client layers (browser, server, admin)
- **Status:** complete

### Phase 3: Public Pages + Registration Flow
- [x] Home, blog list/detail, events list/detail with Stripe registration
- [x] Contact form, testimonials, share buttons, add-to-calendar
- [x] Registration API with Stripe Checkout + webhook
- **Status:** complete

### Phase 4: Service Integration + Deployment
- [x] Supabase: project, migration, admin user, grants
- [x] Stripe: API keys, webhook, test payment
- [x] Resend: confirmation emails with .ics attachment
- [x] PostHog: analytics page tracking
- [x] Vercel: deployment with all env vars
- **Status:** complete

### Phase 5: Polish + Documentation
- [x] Media library component (upload, list, delete files)
- [x] Image embed in TipTap via media library
- [x] Audio embed (Opus/MP3/WAV) in TipTap via media library
- [x] Video URL embed (YouTube/Vimeo) in TipTap
- [x] Instagram oEmbed support
- [x] Admin panel full i18n (all pages, media library, link dialog, VideoUrlDialog)
- [x] Single editor refactor (removed dual RO/EN editors)
- [x] Modern editor toolbar (lucide icons, heading dropdown, blockquote, code, undo/redo)
- [x] Toolbar visual feedback (hover/active states, tooltips with keyboard shortcuts)
- [x] Spellcheck toggle (RO/EN/off) via native browser spellcheck + lang attribute
- [x] `@tailwindcss/typography` installed — prose styles now work in editor + public blog
- [x] Iframe extension fixed for responsive video sizing (absolute position fills wrapper)
- [x] Editor constrained to max-w-4xl centered layout (Google Docs-style)
- [x] Public blog page responsive iframe CSS (handles old content with fixed height)
- [x] Storage RLS policy for media library listing (SQL in migrations/)
- [x] Upload error handling — try/catch + proper error surfacing in media library
- **Status:** complete

### Phase 6: Waiting List, CAPTCHA & Phone Validation
- [x] UI/UX research on yoga website patterns (RESEARCH_FINDINGS.md)
- [x] Dependency bumps: React 19, Stripe 22, TipTap 28, TypeScript 6, ESLint 10
- [x] SQL migration: waiting_list + waiting_list_notifications tables, RLS, indexes
- [x] PhoneInput component with libphonenumber-js, country code selector (RO default)
- [x] Cloudflare Turnstile CAPTCHA wrapper component
- [x] Mobile sticky CTA component (conditional, scrolls to #events)
- [x] Homepage: events section id, capacity badges (X/Y), "Complet" label when full
- [x] i18n keys for fully_booked, waitlist, claim_spot, captcha_error, phone_hint
- [x] Event detail page rewrite: capacity bar, Turnstile, PhoneInput, waiting list flow, claim token
- [x] API: register route — Turnstile verify, phone validate, capacity check (409)
- [x] API: register/waiting-list — insert into waiting_list with captcha
- [x] API: register/claim-spot/[token] — validate token, create registration, mark claimed
- [x] API: register/notify-waiting — batch notification (first 10, 24h expiry)
- [x] Stripe webhook — waiting list trigger on checkout.session.expired and charge.refunded
- [x] Admin events page: registration count, waiting count, waiting list modal
- [x] lib/turnstile.ts — shared Turnstile verification utility
- **Status:** complete

### Phase 7: Content + Future Features
- [ ] Beginner admin guide
- [ ] About page
- [ ] Real content: images, instructor bio
- [x] Auto‑translation (RO → EN) via google-translate-api-x
- [x] Updated blog form: editable Title (EN) + Content (EN) fields, "→ EN" translate buttons
- [x] Updated event form: "→ EN" translate buttons for title + description
- [x] Romanian spellcheck fix: lang="ro-RO", tooltip with Chrome dictionary install instructions
- [x] Spellcheck toggle extended to event form (previously blog-only)
- [x] Spellcheck/lang attributes propagated to Input component and all textareas
- [ ] (future feature requests added here)
- **Status:** in progress

### Phase 8: Security, A11y, i18n & Performance Audit (modern-web-guidance)
- [x] Full audit of public + admin code (security, accessibility, i18n, perf, responsive)
- [x] Security: upload/translate require admin auth; register/contact/testimonials require Turnstile + validation + rate limits; checkout price from server; webhook refund matches session via payment_intent; claim-spot GET→POST; blog/event HTML sanitized (isomorphic-dompurify)
- [x] A11y: dynamic `lang` per locale, skip link, aria-expanded/controls on mobile menu + labels, native `<dialog>` for all modals, Input label association (useId + aria-invalid/describedby), labeled PhoneInput, icon buttons aria-labels, language switcher aria-label, focus-visible rings
- [x] i18n: contact page fully translated, events list EN descriptions, home page strings via messages, share/calendar buttons translated, skip link translated, dead `app/page.tsx` removed
- [x] Perf/responsive: next/image with sizes (events cards, event detail, media library), `dvh` units, `prefers-reduced-motion` support, ICS generation escaping/timezone fix
- [x] Lint + build clean (0 errors, 0 warnings)
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Next.js 16 with Tailwind CSS 4 + Motion | Modern, fast, great DX |
| Supabase for DB/Auth/Storage | Free tier, RLS, easy integration |
| Stripe Checkout for payments | Handles PCI compliance, redirect flow |
| Resend for emails | Simple API, .ics attachments supported |
| PostHog for analytics | Free tier, self-hostable, privacy-friendly |
| Custom admin (not Sanity) | Full control, no external dependency |
| Romanian primary / English secondary | Instructor's audience is RO-first |
| New Supabase API keys (publishable/secret) | Future-proof, recommended by Supabase |
| No Docker | Unnecessary overhead for this project size |
| Single TipTap editor (removed dual RO/EN) | Simplifies UX, bilingual content via title fields only |
| Native browser spellcheck with `lang` attribute | No external dependency, works for any language with OS dict |
| `@tailwindcss/typography` plugin | Tailwind preflight strips all default styles; prose needed for visible formatting |
| lucide-react icons for editor toolbar | Matches existing theme, consistent visual language, no extra deps |
| Editor constrained to max-w-4xl centered | Google Docs / Medium-style readability, full width on mobile |
| libphonenumber-js for phone validation | Lightweight client-side validation, no external API call, country code support |
| Cloudflare Turnstile for CAPTCHA | Free, privacy-friendly (no data tracking), no npm package needed |
| Waiting list claim via unique token (UUID in URL) | Simple stateless flow, 24h expiry per batch, no auth required for claim |
| register_for_event RPC (PostgreSQL function) | Atomic check+insert with SELECT FOR UPDATE, prevents race condition |
| UseRef callbacks in Turnstile component | Decouples effect from inline function references, prevents flickering |
| Stripe webhook uses registrationId from metadata | Targets specific registration instead of blanket event_id match |
| google-translate-api-x for RO→EN translation | Free, zero API keys, 0 dependencies, MIT license, actively maintained |
| Native browser spellcheck (Approach A) for RO | Simplest approach for contenteditable (TipTap); JS spellcheck libs don't integrate cleanly with ProseMirror |
| isomorphic-dompurify for HTML sanitization | Server-side DOMPurify wrapper, works in Node + browser; blog/event HTML from TipTap is user-authorable |
| In-memory rate limiter (lib/rate-limit.ts) | Zero-dep fixed-window per-IP limits on public APIs; adequate for serverless single-instance scope |
| Server-side price lookup in checkout API | Client-supplied price removed — Stripe line items built from DB row only |
| Native `<dialog>` for modals | Free focus trap, Esc handling, backdrop; replaces fixed-div overlays |
| useSyncExternalStore for Turnstile script + admin locale | Rule-compliant external-state subscription; no setState-in-effect |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 403 Supabase on events query | Multiple | Added `grant select on public.events to anon/authenticated` |
| 403 Supabase on admin insert | Multiple | Added `grant insert/update/delete on public.* to authenticated` |
| Resend email not sending | 1 | Fixed fire-and-forget promise to proper try/catch |
| PostHog no data | 1 | Provider wasn't wired into root layout; fixed EU host |
| Admin login infinite loop | 1 | Added `isLoginPage` check in admin layout |
| TipTap template vars parse error | 1 | Replaced `{{ }}` with JSX-safe fragment syntax |
| Auth user creation via SQL failed | 1 | Used Supabase dashboard Add User instead |
| Storage listing empty in media library | 1 | Added SELECT RLS policy on `storage.objects` for media bucket |
| Editor toolbar buttons appear non-functional | 1 | Installed `@tailwindcss/typography` — Tailwind preflight stripped all heading/list/quote styles |
| Media library modals show Romanian always | 1 | Imported `useAdminLocale()` — components weren't connected to locale context |
| YouTube iframes shrink on public blog page | 1 | Added responsive CSS: `.blog-content iframe { width: 100%; aspect-ratio: 16/9 }` |
| Romanian spellcheck underlines all words | 1 | Browser/OS limitation — needs RO language pack installed client-side |
| Turnstile widget flickers on every keystroke | 1 | Fixed: useRef callbacks decouple effect from inline function references |
| Build fails on Vercel: ESLint 10 peer dep conflict | 1 | Fixed: downgraded ESLint 10.7.0 → 9.39.5 |
| Stripe webhook marks all pending registrations as completed | 1 | Fixed: pass registrationId in session metadata, match by id |
| Race condition: two concurrent inserts can exceed max_participants | 1 | Fixed: register_for_event RPC with SELECT FOR UPDATE |
| Refund webhook matched stripe_session_id against payment_intent | 1 | Fixed: resolve payment_intent → checkout session via Stripe API, then match session id |
| Upload/translate APIs callable without auth | 1 | Fixed: is-admin.ts verifies Authorization Bearer via supabase.auth.getUser |
| Claim-spot endpoint vulnerable to CSRF via GET | 1 | Fixed: GET → POST |
| Blog/event HTML rendered raw (stored XSS) | 1 | Fixed: sanitizeHtml wrapper (isomorphic-dompurify) on public render + admin preview |
| Checkout trusted client-supplied price/URLs | 1 | Fixed: server fetches event + registration, builds URLs from Origin header + locale param |
| `next build` failed on deleted app/page.tsx | 1 | Cleaned stale `.next` generated types |
| `next build` type error on checkout route | 1 | Guarded undefined origin header |
| Stripe SDK 22 list() returns array | 1 | sessions.data[0] → Array.isArray check |
| Lint: react-hooks set-state-in-effect (29 errors) | 1 | Inlined fetch-on-mount with .then + cancellation; useSyncExternalStore for script/localStorage; render-adjust pattern for LinkDialog; removed sync setLoading branches |
| npm audit: 12 high (next middleware/SSRF/DoS, postcss, sharp) | 1 | next 16.2.10 → 16.2.12; overrides: next→postcss 8.5.25, next→sharp 0.35.3 (verified optimizer at runtime), minimatch→10.2.6, brace-expansion→5.0.9; audit 0; SWC optionalDeps aligned to 16.2.12; allowScripts sharp key updated |
| next/image rejects seed image host | 1 | Added media.istockphoto.com to images.remotePatterns |
