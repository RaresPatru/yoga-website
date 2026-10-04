import type { Metadata } from "next";
import { absoluteUrl, siteUrl } from "@/lib/site-config";
import { getSiteName } from "@/lib/site-content";
import { routing } from "@/i18n/routing";
import { toPlainText } from "@/lib/plain-text";

export { toPlainText };

/**
 * Builders for per-page metadata: the <title>, the description, and the Open
 * Graph tags that decide what a shared link looks like.
 *
 * WHY THIS MATTERS MORE THAN USUAL HERE
 *
 * The instructor markets entirely on Instagram. Practically every visitor
 * arrives by tapping a link she posted, and the first thing they see is not the
 * page — it is the preview card the link expands into.
 *
 * Before this, the app had exactly one static `metadata` export in the root
 * layout. Every page in the site therefore returned:
 *
 *     <title>Yoga Flow</title>
 *
 * and zero og: tags. Sharing an event to Instagram, WhatsApp or Messenger
 * produced a bare grey link with no image, no title and no date. Search results
 * were equally undifferentiated: every blog post and every event competed under
 * the same title.
 */

/** Strips HTML and clips to a sensible length for a meta description. */
export function toDescription(html: string | null | undefined, fallback: string): string {
  const text = toPlainText(html);
  if (!text) return fallback;
  // ~160 characters is roughly what Google shows before truncating.
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

interface PageMetadataArgs {
  /**
   * The page's own title, WITHOUT the business name — "Blog", "Contact", the
   * title of an event. The name is appended here.
   *
   * It used to be the whole string, and every caller wrote
   * `` `Blog · ${SITE_NAME}` `` for itself. That was fine while the name was a
   * constant and became a liability the moment it turned into something the
   * instructor can edit: eight call sites would each have had to become async
   * and fetch it. Composing it in one place is what keeps them untouched.
   */
  title: string;
  /** Left out entirely when she has not written one; a search engine then picks an excerpt. */
  description?: string | null;
  /** Path without the locale prefix, e.g. "/events/atelier-yoga". */
  path: string;
  locale: string;
  /** Absolute URL of the share image. Falls back to the site-wide default. */
  image?: string;
  /** "article" for blog posts, "website" otherwise. */
  type?: "website" | "article";
  publishedTime?: string;
}

/**
 * Assembles the metadata for one page, including the alternate-language links.
 *
 * `alternates.languages` is what tells Google that /ro/events/x and
 * /en/events/x are the same page in two languages rather than duplicate
 * content competing with each other.
 *
 * ASYNC, AND THAT COSTS ITS CALLERS NOTHING
 *
 * It reads the business name from the database now, because that name is hers
 * to change. Every caller is already inside `generateMetadata`, which Next is
 * happy to let return a promise, so `return buildPageMetadata({...})` keeps
 * working unchanged — and the read itself is usually free, because
 * `getSiteName` shares the per-request cache of the same table the page is
 * already fetching its copy from.
 */
export async function buildPageMetadata({
  title,
  description,
  path,
  locale,
  image,
  type = "website",
  publishedTime,
}: PageMetadataArgs): Promise<Metadata> {
  const url = absoluteUrl(`/${locale}${path}`);
  const shareImage = image ?? absoluteUrl("/api/og/default");
  const siteName = await getSiteName(locale);
  /* "Blog · Yoga Flow". A page with no title of its own is just the business. */
  const fullTitle = title ? `${title} · ${siteName}` : siteName;

  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = absoluteUrl(`/${l}${path}`);
  }
  // Tells search engines which version to serve when it cannot infer a
  // preference from the visitor's own language.
  languages["x-default"] = absoluteUrl(`/${routing.defaultLocale}${path}`);

  return {
    metadataBase: new URL(siteUrl()),
    title: fullTitle,
    ...(description ? { description } : {}),
    alternates: { canonical: url, languages },
    openGraph: {
      title: fullTitle,
      ...(description ? { description } : {}),
      url,
      siteName,
      locale: locale === "ro" ? "ro_RO" : "en_US",
      type,
      ...(publishedTime ? { publishedTime } : {}),
      images: [{ url: shareImage, width: 1200, height: 630, alt: fullTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      ...(description ? { description } : {}),
      images: [shareImage],
    },
  };
}
