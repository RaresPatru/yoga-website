import { ImageResponse } from "next/og";
import { LandscapeCard, OG_SIZE } from "@/lib/og-card";
import { SITE_NAME } from "@/lib/site-config";

/**
 * The fallback share card, used by any page without an image of its own —
 * the home page, contact, testimonials.
 *
 * Having a default matters: a page with no og:image at all gets whatever the
 * platform decides to scrape, which is usually nothing.
 */
export function GET(req: Request) {
  const locale = new URL(req.url).searchParams.get("locale") === "en" ? "en" : "ro";

  return new ImageResponse(
    (
      <LandscapeCard
        title={
          locale === "ro"
            ? "Yoga pentru corp, minte și suflet"
            : "Yoga for body, mind and soul"
        }
        subtitle={
          locale === "ro"
            ? "Ateliere și retreaturi în grupuri mici"
            : "Workshops and retreats in small groups"
        }
        siteName={SITE_NAME}
      />
    ),
    {
      ...OG_SIZE,
      headers: {
        "cache-control": "public, max-age=86400, s-maxage=86400, immutable",
      },
    }
  );
}
