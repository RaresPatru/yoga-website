import type { Metadata } from "next";
import { SITE_NAME, absoluteUrl, siteUrl } from "@/lib/site-config";
import { routing } from "@/i18n/routing";

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
  if (!html) return fallback;

  const text = html
    .replace(/<[^>]*>/g, " ") // TipTap stores rich text; tags must not leak
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return fallback;
  // ~160 characters is roughly what Google shows before truncating.
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

interface PageMetadataArgs {
  title: string;
  description: string;
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
 */
export function buildPageMetadata({
  title,
  description,
  path,
  locale,
  image,
  type = "website",
  publishedTime,
}: PageMetadataArgs): Metadata {
  const url = absoluteUrl(`/${locale}${path}`);
  const shareImage = image ?? absoluteUrl("/api/og/default");

  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = absoluteUrl(`/${l}${path}`);
  }
  // Tells search engines which version to serve when it cannot infer a
  // preference from the visitor's own language.
  languages["x-default"] = absoluteUrl(`/${routing.defaultLocale}${path}`);

  return {
    metadataBase: new URL(siteUrl()),
    title,
    description,
    alternates: { canonical: url, languages },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: locale === "ro" ? "ro_RO" : "en_US",
      type,
      ...(publishedTime ? { publishedTime } : {}),
      images: [{ url: shareImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [shareImage],
    },
  };
}
