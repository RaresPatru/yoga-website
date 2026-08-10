import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { LandscapeCard, OG_SIZE } from "@/lib/og-card";
import { SITE_NAME } from "@/lib/site-config";
import { formatDate } from "@/lib/utils";
import { formatPrice } from "@/lib/money";

/**
 * Renders the 1200x630 preview card for an event.
 *
 * This is what someone sees before they see the site: the image WhatsApp,
 * Messenger, Facebook and Google show when the link is shared. Previously there
 * was no og:image at all, so a shared event appeared as a bare grey link.
 *
 * Generated on demand rather than designed by hand, so every event gets a
 * correct card the moment it is published, with its real title and date, in the
 * right language — with no work from the instructor.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const locale = new URL(req.url).searchParams.get("locale") === "en" ? "en" : "ro";

  // No session: Row Level Security still applies, so an unpublished event
  // cannot be previewed by guessing its slug.
  const supabase = createPublicClient();
  const { data: event } = await supabase
    .from("events")
    .select("title_ro, title_en, date, time, location, price, currency")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!event) {
    // Still return an image rather than a 404: a broken image in a share card
    // looks worse than a plain branded one.
    return new ImageResponse(
      <LandscapeCard title={SITE_NAME} siteName={SITE_NAME} />,
      OG_SIZE
    );
  }

  const title = locale === "ro" ? event.title_ro : event.title_en || event.title_ro;
  const free = locale === "ro" ? "Gratuit" : "Free";

  return new ImageResponse(
    (
      <LandscapeCard
        eyebrow={`${formatDate(event.date, locale)} · ${event.time.slice(0, 5)}`}
        title={title}
        subtitle={event.location ?? undefined}
        badge={event.price === 0 ? free : formatPrice(event.price, event.currency, locale)}
        siteName={SITE_NAME}
      />
    ),
    {
      ...OG_SIZE,
      headers: {
        // Crawlers refetch these often. Caching at the CDN keeps it cheap while
        // still letting an edited event update within the hour.
        "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
