import { notFound } from "next/navigation";
import Image from "next/image";
import { Clock, MapPin, Users } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";
import { sanitizeHtml } from "@/lib/sanitize";
import { formatDate, formatEventSchedule, eventStartInstant } from "@/lib/utils";
import { toCurrency } from "@/lib/money";
import { buildPageMetadata, toDescription } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/site-config";
import { getSiteName } from "@/lib/site-content";
import { mapTarget } from "@/lib/map-link";
import { META_LINK } from "@/lib/meta-link";
import { ShareButton } from "@/components/ui/share-button";
import { EventDateLink } from "@/components/events/event-date-link";
import { EventRegistration } from "@/components/events/event-registration";
import type { Metadata } from "next";

/**
 * Event detail page — a server component.
 *
 * This was previously a single client component that fetched everything in the
 * browser. The consequence was that the page's HTML contained no title, no
 * date, no price and no description: exactly the information a search engine or
 * a social-media crawler needs, and exactly what this business sells. A shared
 * link showed a blank card.
 *
 * Everything below is rendered on the server. The only client JavaScript is
 * <EventRegistration>, which needs state for the form.
 */

interface EventRow {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  description_ro: string | null;
  description_en: string | null;
  date: string;
  /** NULL means she has not announced an hour yet. See the migration. */
  time: string | null;
  /** NULL means it ends on the day it starts. */
  end_date: string | null;
  /** NULL means she has not said when it ends. */
  end_time: string | null;
  location: string | null;
  map_link: string | null;
  price: number;
  currency: string | null;
  max_participants: number | null;
  image_url: string | null;
  whatsapp_group_link: string | null;
}

/** Shared by the page and generateMetadata so the event is fetched once. */
async function getEvent(slug: string): Promise<EventRow | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("events")
    .select(
      "id, slug, title_ro, title_en, description_ro, description_en, date, time, end_date, end_time, location, map_link, price, currency, max_participants, image_url, whatsapp_group_link"
    )
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  return (data as EventRow) ?? null;
}

function localised(event: EventRow, locale: string) {
  const title = locale === "ro" ? event.title_ro : event.title_en || event.title_ro;
  const description =
    locale === "ro" ? event.description_ro : event.description_en || event.description_ro;
  return { title, description };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = await getEvent(slug);

  if (!event) {
    return { title: locale === "ro" ? "Eveniment negăsit" : "Event not found" };
  }

  const { title, description } = localised(event, locale);

  return buildPageMetadata({
    title,
    description: toDescription(
      description,
      `${formatDate(event.date, locale)} · ${event.location ?? ""}`
    ),
    path: `/events/${event.slug}`,
    locale,
    // Generated on demand — see app/api/og/event/[slug]/route.tsx.
    image: absoluteUrl(`/api/og/event/${event.slug}?locale=${locale}`),
  });
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const event = await getEvent(slug);

  if (!event) notFound();

  const { title, description } = localised(event, locale);

  // Seat count comes from the aggregate view, which exposes numbers but no
  // personal data, so it is readable without being logged in.
  const supabase = createPublicClient();
  const { data: availability } = await supabase
    .from("event_availability")
    .select("taken")
    .eq("event_id", event.id)
    .maybeSingle();

  const taken = availability?.taken ?? 0;
  /*
   * NULL or 0 capacity is sold out, not unlimited — see
   * components/events/seat-count.tsx for why, and
   * supabase/migrations/20260918000000_capacity_is_required.sql for where it is
   * actually enforced. This line only decides what the page says; the booking
   * itself is refused by register_for_event() whatever happens here.
   */
  const isFull = !event.max_participants || taken >= event.max_participants;
  const t = (ro: string, en: string) => (locale === "ro" ? ro : en);

  /*
   * Null when she has not pinned the place, or when what she typed was neither
   * a usable URL nor a coordinate pair — lib/map-link.ts decides, and refusing
   * is the safe answer there because this value becomes an href on a public
   * page. Everything below that touches the map is guarded on it.
   */
  const map = mapTarget(event.map_link);

  // The same formatter the two card surfaces use, so the date a visitor read on
  // the home page is the date they read here.
  const schedule = formatEventSchedule(event, locale);

  /**
   * schema.org Event data, embedded as JSON-LD.
   *
   * This is what makes an event eligible for Google's event results — the
   * panel that shows a date, a location and a link directly in search. For a
   * business that exists to run events, it is the single highest-value piece of
   * structured data on the site.
   */
  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: title,
    // Computed rather than written as a literal "+03:00". Romania is UTC+3 in
    // summer and UTC+2 in winter, so a hardcoded offset publishes every winter
    // event to Google's event results an hour early.
    startDate: eventStartInstant(event.date, event.time).toISOString(),
    /*
     * Google's event results show a duration when one is published, and rank a
     * listing with `endDate` above one without. Included only when she has
     * actually said — a guessed end time in structured data is a guess Google
     * shows to strangers as fact, which is worse than the same guess on the
     * page.
     */
    ...(event.end_date || event.end_time
      ? {
          endDate: eventStartInstant(
            event.end_date || event.date,
            event.end_time || event.time
          ).toISOString(),
        }
      : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    description: toDescription(description, title),
    ...(event.image_url ? { image: [event.image_url] } : {}),
    // Where she says it is, or nothing. It used to fall back to Cluj-Napoca,
    // a placeholder: her events happen anywhere in Romania (audit R6).
    ...(event.location
      ? {
          location: {
            "@type": "Place",
            name: event.location,
            address: { "@type": "PostalAddress", addressLocality: event.location, addressCountry: "RO" },
          },
        }
      : {}),
    organizer: { "@type": "Organization", name: await getSiteName(locale), url: absoluteUrl("/") },
    offers: {
      "@type": "Offer",
      price: event.price,
      priceCurrency: toCurrency(event.currency),
      availability: isFull
        ? "https://schema.org/SoldOut"
        : "https://schema.org/InStock",
      url: absoluteUrl(`/${locale}/events/${event.slug}`),
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <script
        type="application/ld+json"
        // Serialised JSON only; no user input reaches this as markup.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventSchema) }}
      />

      {/*
        `min-w-0` on both columns.

        A grid item defaults to `min-width: auto`, meaning it refuses to shrink
        below the widest thing inside it. Anything unshrinkable — a long URL in
        the description, a wide embed, or the phone field that actually caused
        this — therefore does not overflow its own column; it widens the column,
        then the grid, then the page. The symptom is the entire event page
        scrolling sideways on a phone, which is how it was found: 435px of
        layout on a 390px screen, with the header stretched along with it.

        `min-w-0` opts out of that, so overflow stays a local problem instead of
        becoming the whole document's.
      */}
      <div className="grid gap-12 md:grid-cols-5">
        <div className="min-w-0 md:col-span-3">
          {event.image_url && (
            <div className="relative mb-8 aspect-video overflow-hidden rounded-3xl bg-sage/10">
              <Image
                src={event.image_url}
                alt={title}
                fill
                sizes="(max-width: 768px) 100vw, 60vw"
                className="object-cover"
                priority
              />
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            {/*
              `min-w-0 break-words` because the title is whatever the instructor
              typed. A flex item will not shrink below its longest unbreakable
              word, and the share button beside it refuses to wrap, so one long
              token — a hashtag, a URL, a compound word — pushed this row past
              the screen edge and took the whole page with it. `break-words`
              lets the word split as a last resort; `min-w-0` lets the heading
              shrink far enough to need to.
            */}
            <h1 className="min-w-0 break-words font-serif text-4xl text-charcoal md:text-5xl">
              {title}
            </h1>
            <ShareButton title={title} />
          </div>

          {/*
            Two of these four do something and two are facts. The two that do
            carry an icon, an underline and a darker ink — see lib/meta-link.ts
            for why it takes all three on a device with no hover.
          */}
          <div className="mt-6 flex flex-wrap gap-4 text-sm text-charcoal-light">
            <EventDateLink
              slug={event.slug}
              locale={locale}
              dateText={schedule.date}
              addLabel={t("Adaugă în calendar", "Add to calendar")}
              // The only one of the three whose name is not a brand everybody
              // recognises, so it says what the file is as well as what opens it.
              appleLabel={t("Apple Calendar (.ics)", "Apple Calendar (.ics)")}
              event={{
                title,
                description: description || "",
                date: event.date,
                time: event.time,
                location: event.location || "",
                endDate: event.end_date,
                endTime: event.end_time,
                url: absoluteUrl(`/${locale}/events/${encodeURIComponent(event.slug)}`),
              }}
            />
            {/* `whitespace-nowrap` because the thin spaces around the en dash
                are breaking spaces, so a narrow enough column would put the end
                time on its own line and leave a dash hanging. */}
            {schedule.time && (
              <span className="flex items-center gap-2 whitespace-nowrap">
                {/* A range once she has said when it ends, the start alone
                    until then, and nothing at all until she has announced an
                    hour — none of the three is ever a guess. */}
                <Clock className="h-4 w-4" aria-hidden="true" />
                {schedule.time}
              </span>
            )}
            {/*
              The address opens a map when she has supplied one, and is plain
              text when she has not. Deliberately only here: on the home page
              and the events index the whole card is already a link, and a link
              inside a link is invalid HTML that browsers repair by closing the
              outer one early — which breaks the card, not just the address.

              `rel="noopener noreferrer"` because this leaves the site, and
              `target="_blank"` so somebody who came to read about the class
              still has the class open when they come back from the map.
            */}
            {event.location &&
              (map ? (
                <a
                  href={map.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-tooltip={t("Vezi pe hartă", "View on the map")}
                  // The address stays inside the name rather than being replaced
                  // by it — same reason as the date link: WCAG 2.5.3 wants the
                  // visible label in the accessible name, and somebody listening
                  // to the page still needs to hear where the class is.
                  aria-label={`${event.location} — ${t("vezi pe hartă", "view on the map")}`}
                  className={META_LINK}
                >
                  <MapPin className="h-4 w-4" aria-hidden="true" /> {event.location}
                </a>
              ) : (
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" aria-hidden="true" /> {event.location}
                </span>
              ))}
            {/* No `max_participants &&` guard any more. It used to hide this
                line entirely for an event with no capacity set, which was the
                whole bug: the event was bookable by anyone and the page said
                nothing about seats at all. A capacity of NULL or 0 now reads as
                sold out, and the fraction below only ever runs when there is a
                real number to put in it. */}
            <span className={`flex items-center gap-2 ${isFull ? "text-error" : ""}`}>
              <Users className="h-4 w-4" aria-hidden="true" />
              {isFull
                ? /* One phrase for one state, site-wide — the card that brought
                     someone here says this too. components/events/seat-count.tsx
                     is where that vocabulary is decided. */
                  t("Locuri epuizate", "Sold out")
                : t("{filled}/{total} locuri", "{filled}/{total} spots")
                    .replace("{filled}", String(taken))
                    .replace("{total}", String(event.max_participants))}
            </span>
          </div>

          {description && (
            <div
              // break-words for the same reason as the heading: this is
              // instructor-written HTML and may contain a bare URL, which is
              // one long unbreakable token.
              className="prose prose-sage blog-content mt-8 max-w-none break-words"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}
            />
          )}

        </div>

        <div className="min-w-0 md:col-span-2">
          <EventRegistration
            eventId={event.id}
            price={event.price}
            currency={toCurrency(event.currency)}
            maxParticipants={event.max_participants}
            taken={taken}
            whatsappLink={event.whatsapp_group_link}
            locale={locale}
          />
        </div>
      </div>
    </div>
  );
}
