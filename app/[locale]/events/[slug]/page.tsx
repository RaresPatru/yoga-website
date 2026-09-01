import { notFound } from "next/navigation";
import Image from "next/image";
import { Calendar, Clock, MapPin, Users } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";
import { sanitizeHtml } from "@/lib/sanitize";
import { formatDate, formatTime, eventStartInstant } from "@/lib/utils";
import { toCurrency } from "@/lib/money";
import { buildPageMetadata, toDescription } from "@/lib/metadata";
import { absoluteUrl, SITE_NAME, SITE_LOCALITY, SITE_COUNTRY } from "@/lib/site-config";
import { ShareButton } from "@/components/ui/share-button";
import { AddCalendar } from "@/components/ui/add-calendar";
import { StoryImageButton } from "@/components/ui/story-image-button";
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
  time: string;
  location: string | null;
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
      "id, slug, title_ro, title_en, description_ro, description_en, date, time, location, price, currency, max_participants, image_url, whatsapp_group_link"
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
    title: `${title} · ${SITE_NAME}`,
    description: toDescription(
      description,
      locale === "ro"
        ? `${formatDate(event.date, locale)} · ${event.location ?? ""}`
        : `${formatDate(event.date, locale)} · ${event.location ?? ""}`
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
  const isFull = event.max_participants != null && taken >= event.max_participants;
  const t = (ro: string, en: string) => (locale === "ro" ? ro : en);

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
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    description: toDescription(description, title),
    ...(event.image_url ? { image: [event.image_url] } : {}),
    location: {
      "@type": "Place",
      name: event.location || SITE_LOCALITY,
      address: {
        "@type": "PostalAddress",
        addressLocality: event.location || SITE_LOCALITY,
        addressCountry: SITE_COUNTRY,
      },
    },
    organizer: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
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

          <div className="mt-6 flex flex-wrap gap-4 text-sm text-charcoal-light">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4" aria-hidden="true" /> {formatDate(event.date, locale)}
            </span>
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4" aria-hidden="true" /> {formatTime(event.time)}
            </span>
            {event.location && (
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" aria-hidden="true" /> {event.location}
              </span>
            )}
            {event.max_participants && (
              <span className={`flex items-center gap-2 ${isFull ? "text-error" : ""}`}>
                <Users className="h-4 w-4" aria-hidden="true" />
                {isFull
                  ? t("Complet", "Full")
                  : t("{filled}/{total} locuri", "{filled}/{total} spots")
                      .replace("{filled}", String(taken))
                      .replace("{total}", String(event.max_participants))}
              </span>
            )}
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

          <div className="mt-8 flex flex-wrap gap-3">
            <AddCalendar
              event={{
                title,
                description: description || "",
                date: event.date,
                time: event.time,
                location: event.location || "",
                uid: event.id,
              }}
            />
            <StoryImageButton
              href={`/api/og/event/${event.slug}/story?locale=${locale}`}
              fileName={`${event.slug}-story.png`}
              locale={locale}
            />
          </div>
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
