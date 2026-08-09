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
 * PLACEHOLDER — the instructor has not chosen a business name yet.
 *
 * Changing this one value renames the site everywhere: header, footer, page
 * titles, social share cards and structured data. See docs/CONTENT-NEEDED.md.
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
