import { createPublicClient } from "@/lib/supabase/public";
import { Link } from "@/i18n/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { SeatCount } from "@/components/events/seat-count";
import { eventAvailability } from "@/lib/event-availability";
import { formatEventSchedule, eventStartInstant } from "@/lib/utils";
import { formatPrice } from "@/lib/money";
import { getLocale, getTranslations } from "next-intl/server";
import { buildPageMetadata, toPlainText } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/site-config";
import { Calendar, Clock, MapPin } from "lucide-react";
import Image from "next/image";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({
    title: locale === "ro" ? "Evenimente" : "Events",
    description:
      locale === "ro"
        ? "Ateliere, retreaturi și sesiuni de yoga în grupuri mici. Vezi datele următoare și rezervă-ți locul."
        : "Workshops, retreats and yoga sessions in small groups. See upcoming dates and book your spot.",
    path: "/events",
    locale,
    image: absoluteUrl(`/api/og/default?locale=${locale}`),
  });
}

export default async function EventsPage() {
  const locale = await getLocale();
  const t = await getTranslations("events");
  const supabase = createPublicClient();

  // One reading of the clock for both the query's date floor and the
  // time-of-day cutoff below, so a render that straddles midnight cannot filter
  // against two different days.
  const renderedAt = new Date();
  const today = renderedAt.toISOString().split("T")[0];

  const { data: upcoming } = await supabase
    .from("events")
    .select("id, slug, title_ro, title_en, date, time, end_date, end_time, location, price, currency, max_participants, image_url, description_ro, description_en")
    .eq("published", true)
    .gte("date", today)
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  /**
   * Drop the ones that have already started.
   *
   * The query can only filter by date, and a date is not the cutoff: `date >=
   * today` still matches this morning's seven-thirty class at six in the
   * evening. The home page applies the same rule, so without this the two pages
   * disagree — an event the home page has hidden leads the listing that "see
   * all events" sends you to, which reads as a bug in the home page rather than
   * a stale row here.
   *
   * `eventStartInstant` resolves the stored wall-clock time through
   * Europe/Bucharest, so the comparison stays correct across the daylight-saving
   * switch. It happens here rather than in SQL because the stored time has no
   * zone attached; teaching Postgres that would mean changing the column type.
   */
  const events = (upcoming ?? []).filter(
    (event) => eventStartInstant(event.date, event.time).getTime() >= renderedAt.getTime()
  );

  /**
   * Seats remaining, per event.
   *
   * This listing had no seat count at all, which stopped being merely a gap the
   * moment the home page started demoting full events below bookable ones:
   * someone who follows "see all events" from there lands on a page that leads
   * with the very date the home page hid, and nothing explains why. The count
   * is the explanation.
   *
   * The order is deliberately left chronological. This is an index, not a
   * recommendation — someone who opens it wants the calendar, and a full date is
   * still worth seeing so they can join the waiting list.
   *
   * Why the seat count cannot simply be read from `registrations`, and why this
   * is a shared helper rather than a query written out here, are both in
   * lib/event-availability.ts.
   */
  const availability = await eventAvailability(supabase, events.map((e) => e.id));

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal">{t("title")}</h1>
      <p className="mt-2 text-charcoal-light">{t("subtitle")}</p>

      {!events.length ? (
        <p className="mt-8 text-charcoal-light">{t("no_events")}</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            // One place decides how a date and an hour are said, so the card
            // here, the carousel slide on the home page and the event page
            // itself cannot drift apart.
            const schedule = formatEventSchedule(event, locale);
            return (
            <Link key={event.id} href={`/events/${event.slug}`} className="block rounded-2xl">
              <GlassCard className="group h-full">
                {event.image_url && (
                  /*
                    Left, top and right, because this card is always stacked:
                    the photograph is its lid. `-3` against the card's `p-6`
                    gives it half that padding and leaves the other half, so it
                    sits a little proud of the text without reaching the edge —
                    which it cannot do, for the reason written out in
                    components/events/event-feature-card.tsx: this card's
                    backdrop-filter defeats rounded overflow clipping.
                  */
                  <div className="relative -mx-3 -mt-3 mb-4 aspect-[3/2] overflow-hidden rounded-xl bg-sage/10">
                    <Image
                      src={event.image_url}
                      alt={locale === "ro" ? event.title_ro : (event.title_en || event.title_ro)}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      // The photograph is the thing worth looking at, so it is
                      // what answers the hover: a slow push-in inside the
                      // clipped, rounded frame while the card itself lifts.
                      //
                      // `scale-100` is the resting identity — same reason as the
                      // one in GlassCard. `motion-safe:` is a media query rather
                      // than JavaScript, so the zoom simply never exists for
                      // someone who has asked for reduced motion.
                      className="object-cover scale-100 transition-transform duration-500 ease-out motion-safe:group-hover:scale-105"
                    />
                  </div>
                )}
                <h2 className="font-serif text-xl text-charcoal">
                  {locale === "ro" ? event.title_ro : (event.title_en || event.title_ro)}
                </h2>
                {/* Stripped of markup — the column holds HTML, which the event
                    page renders and which this card would otherwise print. */}
                <p className="mb-4 mt-2 line-clamp-2 text-sm text-charcoal-light">
                  {toPlainText(
                    locale === "ro"
                      ? event.description_ro
                      : event.description_en || event.description_ro
                  )}
                </p>
                <div className="flex flex-wrap gap-3 text-sm text-charcoal-light">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                    {schedule.date}
                  </span>
                  {/* No clock at all when she has not announced an hour — an
                      empty one beside a date reads as a rendering fault. */}
                  {schedule.time && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {schedule.time}
                    </span>
                  )}
                  {event.location && (
                    <span className="flex items-center gap-1">
                      {/* Optically matched to the `h-3.5` icons beside it —
                          see the note on the same icon in the feature card. */}
                      <MapPin className="h-[16px] w-[16px]" aria-hidden="true" />{" "}
                      {event.location}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-rose/10 px-3 py-1 text-sm font-medium text-rose-deep">
                    {event.price === 0 ? t("free") : formatPrice(event.price, event.currency, locale)}
                  </span>
                  <SeatCount locale={locale} info={availability.get(event.id)} compact />
                </div>
              </GlassCard>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}