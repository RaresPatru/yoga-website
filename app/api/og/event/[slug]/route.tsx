import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { LandscapeCard, OG_SIZE } from "@/lib/og-card";
import { getSiteName } from "@/lib/site-content";
import { formatEventSchedule } from "@/lib/utils";
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
  /* The share card carries her business name, so it has to read the name she
     set rather than the placeholder that used to be compiled in. */
  const siteName = await getSiteName(locale);

  // No session: Row Level Security still applies, so an unpublished event
  // cannot be previewed by guessing its slug.
  const supabase = createPublicClient();
  const { data: event } = await supabase
    .from("events")
    .select("title_ro, title_en, date, time, end_date, end_time, location, price, currency")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!event) {
    // Still return an image rather than a 404: a broken image in a share card
    // looks worse than a plain branded one.
    return new ImageResponse(
      <LandscapeCard title={siteName} siteName={siteName} />,
      OG_SIZE
    );
  }

  const title = locale === "ro" ? event.title_ro : event.title_en || event.title_ro;
  const free = locale === "ro" ? "Gratuit" : "Free";
  // The start time is optional, so the eyebrow is the date alone when there is
  // none (a missing time used to crash the whole card).
  const schedule = formatEventSchedule(event, locale);
  const eyebrow = schedule.time ? `${schedule.date} · ${schedule.time}` : schedule.date;

  return new ImageResponse(
    (
      <LandscapeCard
        eyebrow={eyebrow}
        title={title}
        subtitle={event.location ?? undefined}
        badge={event.price === 0 ? free : formatPrice(event.price, event.currency, locale)}
        siteName={siteName}
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
