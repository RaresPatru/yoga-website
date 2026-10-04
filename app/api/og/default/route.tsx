import { ImageResponse } from "next/og";
import { LandscapeCard, OG_SIZE } from "@/lib/og-card";
import { getSiteContent, getSiteName } from "@/lib/site-content";

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
  /* Her tagline and description ("Conținut site" → "SEO și firmă"). Without a
     tagline the card carries just the name; the words it used to print were
     invented on her behalf. */
  const content = await getSiteContent(locale);
  const tagline = content["seo.tagline"];

  return new ImageResponse(
    (
      <LandscapeCard
        title={tagline ?? siteName}
        subtitle={tagline ? content["seo.description"] ?? "" : ""}
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
