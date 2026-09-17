import { ImageResponse } from "next/og";
import { LandscapeCard, OG_SIZE } from "@/lib/og-card";
import { getSiteName } from "@/lib/site-content";

/**
 * The fallback share card, used by any page without an image of its own —
 * the home page, contact, testimonials.
 *
 * Having a default matters: a page with no og:image at all gets whatever the
 * platform decides to scrape, which is usually nothing.
 */
export async function GET(req: Request) {
  const locale = new URL(req.url).searchParams.get("locale") === "en" ? "en" : "ro";
  /* The share card carries her business name, so it has to read the name she
     set rather than the placeholder that used to be compiled in. */
  const siteName = await getSiteName(locale);

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
        siteName={siteName}
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
