import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { eventAvailability } from "@/lib/event-availability";
import { eventPhase } from "@/lib/event-phase";
import { pageFrom } from "@/lib/blog";
import { getLocale, getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/site-config";
import { EventCard } from "@/components/events/event-card";
import { Pagination } from "@/components/ui/pagination";
import type { Metadata } from "next";

/** Twelve fills one, two or three columns evenly (the same as the blog). */
const PAST_PER_PAGE = 12;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const page = pageFrom((await searchParams).page);
  const t = await getTranslations({ locale, namespace: "events" });
  return buildPageMetadata({
    title: page > 1 ? t("archive_page_title", { page }) : t("title"),
    description:
      locale === "ro"
        ? "Ateliere, retreaturi și sesiuni de yoga în grupuri mici. Vezi datele următoare și rezervă-ți locul."
        : "Workshops, retreats and yoga sessions in small groups. See upcoming dates and book your spot.",
    // Each page of the archive is its own address, so its own canonical URL.
    path: page > 1 ? `/events?page=${page}` : "/events",
    locale,
    image: absoluteUrl(`/api/og/default?locale=${locale}`),
  });
}

/**
 * The events index: what is still to come, then what has been.
 *
 * Upcoming events are every published event that has not ended, soonest
 * first. One already under way is marked "În desfășurare" and cannot be
 * booked; bookings close at the start (register_for_event). Filtering happens
 * in SQL on `starts_at` and `ends_at`, the instants Postgres computes in
 * Bucharest time, so there is no clock arithmetic here.
 *
 * Below them, the archive: ended events she has not hidden from it
 * (`show_in_archive`), newest first, twelve to a page with the page number in
 * the address. Only the archive is paged; the upcoming list is short.
 */
export default async function EventsPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations("events");
  const tp = await getTranslations("pagination");
  const supabase = createPublicClient();
  const page = pageFrom((await searchParams).page);
  const now = new Date();
  const from = (page - 1) * PAST_PER_PAGE;

  const [{ data: upcoming }, { data: past, count }] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, slug, title_ro, title_en, date, time, end_date, end_time, location, price, currency, max_participants, image_url, description_ro, description_en, starts_at, ends_at"
      )
      .eq("published", true)
      .gt("ends_at", now.toISOString())
      .order("starts_at", { ascending: true }),
    supabase
      .from("events")
      .select(
        "id, slug, title_ro, title_en, date, time, end_date, end_time, location, price, currency, image_url, description_ro, description_en",
        { count: "exact" }
      )
      .eq("published", true)
      .eq("show_in_archive", true)
      .lte("ends_at", now.toISOString())
      .order("starts_at", { ascending: false })
      .range(from, from + PAST_PER_PAGE - 1),
  ]);

  const pageCount = Math.max(1, Math.ceil((count ?? 0) / PAST_PER_PAGE));
  // A page past the end of the archive is a missing page, not an empty one.
  if (page > pageCount) notFound();

  const events = upcoming ?? [];
  // Seats remaining, from the view that counts them without the names behind
  // them (lib/event-availability.ts). The order stays chronological: this is
  // an index, not a recommendation, and a full date is still worth seeing so
  // people can join its waiting list.
  const availability = await eventAvailability(supabase, events.map((e) => e.id));
  const labels = { free: t("free"), ongoing: t("ongoing") };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal">{t("title")}</h1>
      <p className="mt-2 text-charcoal-light">{t("subtitle")}</p>

      {page === 1 &&
        (!events.length ? (
          <p className="mt-8 text-charcoal-light">{t("no_events")}</p>
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <li key={event.id} className="min-w-0">
                <EventCard
                  event={event}
                  locale={locale}
                  phase={eventPhase(event.starts_at, event.ends_at, now.getTime())}
                  availability={availability.get(event.id)}
                  labels={labels}
                />
              </li>
            ))}
          </ul>
        ))}

      {past && past.length > 0 && (
        <section className={page === 1 ? "mt-20" : "mt-10"} aria-labelledby="events-archive">
          <h2 id="events-archive" className="font-serif text-3xl text-charcoal">
            {t("archive_title")}
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((event) => (
              <li key={event.id} className="min-w-0">
                <EventCard event={event} locale={locale} phase="ended" labels={labels} headingLevel={3} />
              </li>
            ))}
          </ul>
          <Pagination
            className="mt-12"
            page={page}
            pageCount={pageCount}
            href={(p) => (p === 1 ? `/${locale}/events#events-archive` : `/${locale}/events?page=${p}#events-archive`)}
            labels={{
              label: tp("label"),
              previous: tp("previous"),
              next: tp("next"),
              page: (p) => tp("page", { page: p }),
            }}
          />
        </section>
      )}
    </div>
  );
}
