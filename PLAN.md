> **IMPORTANT INSTRUCTION:** Before every major action (making a change, running a command, starting a new phase), re-read this file. After completing a phase, update the status. Log all errors. This file is the persistent source of truth — the model's memory can be pruned, but this file survives.

# Project Plan

## Goal
A responsive yoga website for a female instructor with blog, paid/free event registration via Stripe, email confirmations with calendar invites, testimonials, admin dashboard, and analytics — deployed on Vercel.

## Current Phase
Phase 6

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

### Phase 6: Content + Future Features
- [ ] Beginner admin guide
- [ ] About page
- [ ] Real content: images, instructor bio
- [ ] (future feature requests added here)
- **Status:** pending

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
