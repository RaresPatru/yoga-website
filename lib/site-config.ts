/**
 * Single source of truth for the site's identity and absolute URL.
 *
 * Both were previously scattered as string literals: "Yoga Flow" was typed into
 * the header, the footer and the page title separately, and the absolute URL
 * was read straight from an environment variable that is not actually set
 * anywhere — so the claim links in waiting-list emails were being built as
 * "undefined/ro/events/...".
 */

/**
 * THE FALLBACK NAME, NOT THE NAME.
 *
 * The business name is hers to set, from "Conținut site" in the admin panel —
 * it lives in `site_content` under `general.site_name` and is read through
 * `getSiteName()` in lib/site-content.ts, which is what the header, the footer,
 * every page title, every share card and the structured data all use.
 *
 * This constant is what those fall back to while the field is still empty, and
 * if the database is ever unreachable. Do not import it to display the name:
 * doing so would show "Yoga Flow" on a site she has already renamed, which is
 * the exact half-wired failure the footer's Instagram link once had.
 */
export const SITE_NAME = "Yoga Flow";

/** PLACEHOLDER — replace with her actual name once confirmed. */
export const INSTRUCTOR_NAME = "Yoga Flow";

/** Where events usually take place; used for local-business structured data. */
export const SITE_LOCALITY = "Cluj-Napoca";
export const SITE_COUNTRY = "RO";

/**
 * The site's public origin, with no trailing slash.
 *
 * Absolute URLs are not optional for the things that need this. Open Graph
 * tags, canonical links and sitemap entries are read by machines that have no
 * page to resolve a relative path against — a relative og:image simply does not
 * render a preview.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL   — set this in Vercel; it is the only one that
 *                               survives custom domains.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel provides this automatically, so
 *                               previews and un-configured deploys still get
 *                               working links rather than "undefined".
 *   3. localhost              — development.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

/** Builds an absolute URL from a path such as "/ro/events/atelier". */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
