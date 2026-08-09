import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-config";

/**
 * Served at /robots.txt. Lighthouse previously flagged this as missing.
 *
 * Two jobs: point crawlers at the sitemap, and keep them out of places that
 * should never appear in search results.
 *
 * `disallow` is not a security control — it is a request, and only well-behaved
 * crawlers honour it. The admin panel is protected by proxy.ts and Row Level
 * Security; this simply stops the login page turning up in Google, which is
 * both pointless for visitors and a small invitation to attackers.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // `allow` is listed before `disallow` and is more specific, which is how
      // crawlers resolve the conflict: the longer matching rule wins.
      //
      // /api/og/ MUST stay crawlable. Every og:image and twitter:image on the
      // site points there, and Facebook, WhatsApp and the X card fetcher all
      // honour robots.txt — a blanket "/api/" disallow meant every shared link
      // expanded to a card with no image, which is precisely what the generated
      // share images exist to prevent.
      allow: ["/", "/api/og/"],
      disallow: [
        "/admin",   // private, and useless as a search result
        "/api/",    // the rest: endpoints, not pages
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
