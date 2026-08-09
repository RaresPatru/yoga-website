import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { StoryCard, STORY_SIZE } from "@/lib/og-card";
import { SITE_NAME } from "@/lib/site-config";
import { formatDate } from "@/lib/utils";

/**
 * Renders a 1080x1920 image sized for an Instagram story.
 *
 * Not a social preview — a deliverable. Instagram does not expand links into
 * preview cards inside stories, so the landscape og:image is no use there. This
 * gives the instructor a finished graphic for the channel she actually markets
 * on: open the event page, tap "Descarcă pentru Instagram", post it.
 *
 * It stays correct by construction. The title, date, location and price come
 * from the same row the page renders, so a rescheduled event cannot end up
 * advertised with last week's date — which is exactly what happens when the
 * graphic is made by hand in a separate tool.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const locale = new URL(req.url).searchParams.get("locale") === "en" ? "en" : "ro";

  const supabase = createPublicClient();
  const { data: event } = await supabase
    .from("events")
    .select("title_ro, title_en, date, time, location, price")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!event) {
    return new ImageResponse(<StoryCard title={SITE_NAME} siteName={SITE_NAME} />, STORY_SIZE);
  }

  const title = locale === "ro" ? event.title_ro : event.title_en || event.title_ro;
  const free = locale === "ro" ? "Gratuit" : "Free";

  return new ImageResponse(
    (
      <StoryCard
        eyebrow={`${formatDate(event.date, locale)} · ${event.time.slice(0, 5)}`}
        title={title}
        subtitle={event.location ?? undefined}
        badge={event.price === 0 ? free : `${event.price} RON`}
        siteName={SITE_NAME}
      />
    ),
    {
      ...STORY_SIZE,
      headers: {
        "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
