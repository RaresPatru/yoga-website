import { notFound } from "next/navigation";
import { Quote } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { getTranslations } from "next-intl/server";
import { formatDate, formatEventSchedule, eventStartInstant } from "@/lib/utils";
import { toCurrency } from "@/lib/money";
import { buildPageMetadata, toDescription } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/site-config";
import { getSiteName } from "@/lib/site-content";
import { mapTarget } from "@/lib/map-link";
import { eventPhase } from "@/lib/event-phase";
import { buttonClasses } from "@/lib/button-styles";
import { Link } from "@/i18n/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Rating } from "@/components/ui/rating";
import { EventRegistration } from "@/components/events/event-registration";
import { BookingClosed, EventView } from "@/components/events/event-view";
import type { Metadata } from "next";

/**
 * Event detail page — a server component.
 *
 * This was once a single client component that fetched everything in the
 * browser, so the page's HTML held no title, date, price or description: what
 * a search engine or a social-media crawler needs, and what this business
 * sells. Everything below is rendered on the server; the only client
 * JavaScript is the booking panel.
 *
 * The page follows the event's life (lib/event-phase.ts): before it starts,
 * the booking panel; once it has started, a notice that booking has closed;
 * once it is over, the same notice and what participants said about it. An
 * Instagram story lives forever, so an old one must land on a page that says
 * the event is over rather than one that takes a payment (audit B4).
 */

interface EventRow {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  description_ro: string | null;
  description_en: string | null;
  date: string;
  /** NULL means she has not announced an hour yet. */
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
  starts_at: string;
  ends_at: string;
}

/** Shared by the page and generateMetadata so the event is fetched once. */
async function getEvent(slug: string): Promise<EventRow | null> {
  const { data } = await createPublicClient()
    .from("events")
    .select(
      "id, slug, title_ro, title_en, description_ro, description_en, date, time, end_date, end_time, location, map_link, price, currency, max_participants, image_url, whatsapp_group_link, starts_at, ends_at"
    )
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  return (data as EventRow) ?? null;
}

function localised(event: EventRow, locale: string) {
  const title = locale === "ro" ? event.title_ro : event.title_en || event.title_ro;
  const description = locale === "ro" ? event.description_ro : event.description_en || event.description_ro;
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
    description: toDescription(description, `${formatDate(event.date, locale)} · ${event.location ?? ""}`),
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
  const phase = eventPhase(event.starts_at, event.ends_at);
  const t = (ro: string, en: string) => (locale === "ro" ? ro : en);
  const te = await getTranslations({ locale, namespace: "embed" });
  const supabase = createPublicClient();

  // Seat count comes from the aggregate view, which exposes numbers but no
  // personal data, so it is readable without being logged in.
  const { data: availability } = await supabase
    .from("event_availability")
    .select("taken")
    .eq("event_id", event.id)
    .maybeSingle();
  const taken = availability?.taken ?? 0;
  /*
   * NULL or 0 capacity is sold out, not unlimited — see
   * components/events/seat-count.tsx for why, and register_for_event() for
   * where it is actually enforced. This line only decides what the page says.
   */
  const isFull = !event.max_participants || taken >= event.max_participants;

  // Once it is over, what the people who came said about it: approved only,
  // which is all the read policy returns anyway.
  const { data: testimonials } =
    phase === "ended"
      ? await supabase
          .from("testimonials")
          .select("id, content, rating, author_name")
          .eq("event_id", event.id)
          .eq("approved", true)
          .order("created_at", { ascending: false })
      : { data: null };

  /*
   * Null when she has not pinned the place, or when what she typed was neither
   * a usable URL nor a coordinate pair — lib/map-link.ts decides, and refusing
   * is the safe answer there because this value becomes an href on a public
   * page.
   */
  const map = mapTarget(event.map_link);

  // The same formatter the card surfaces use, so the date a visitor read on the
  // home page is the date they read here.
  const schedule = formatEventSchedule(event, locale);

  /**
   * schema.org Event data, embedded as JSON-LD: what makes an event eligible
   * for Google's event results. The offer is there only while booking is open;
   * an offer for a seat nobody can book would be a false statement.
   */
  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: title,
    // Computed rather than written as a literal "+03:00": Romania is UTC+3 in
    // summer and UTC+2 in winter.
    startDate: eventStartInstant(event.date, event.time).toISOString(),
    // Included only when she has said: a guessed end in structured data is a
    // guess Google shows to strangers as fact.
    ...(event.end_date || event.end_time
      ? { endDate: eventStartInstant(event.end_date || event.date, event.end_time || event.time).toISOString() }
      : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    description: toDescription(description, title),
    ...(event.image_url ? { image: [event.image_url] } : {}),
    // Where she says it is, or nothing: her events happen anywhere in Romania
    // (audit R6).
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
    ...(phase === "upcoming"
      ? {
          offers: {
            "@type": "Offer",
            price: event.price,
            priceCurrency: toCurrency(event.currency),
            availability: isFull ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
            url: absoluteUrl(`/${locale}/events/${event.slug}`),
          },
        }
      : {}),
  };

  const onward = (
    <Link href="/events" className={buttonClasses({ variant: "secondary", size: "sm" })}>
      {t("Vezi evenimentele următoare", "See upcoming events")}
    </Link>
  );

  const aside =
    phase === "upcoming" ? (
      <EventRegistration
        eventId={event.id}
        price={event.price}
        currency={toCurrency(event.currency)}
        maxParticipants={event.max_participants}
        taken={taken}
        whatsappLink={event.whatsapp_group_link}
        locale={locale}
      />
    ) : phase === "ongoing" ? (
      <BookingClosed
        heading={t("Evenimentul este în desfășurare", "This event is under way")}
        body={t("Înscrierile s-au închis când a început.", "Bookings closed when it began.")}
        action={onward}
      />
    ) : (
      <BookingClosed
        heading={t("Evenimentul s-a încheiat", "This event has ended")}
        body={t("Înscrierile s-au închis.", "Bookings are closed.")}
        action={onward}
      />
    );

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <script
        type="application/ld+json"
        // Serialised JSON only; no user input reaches this as markup.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventSchema) }}
      />

      <EventView
        locale={locale}
        status={
          phase === "upcoming" ? null : (
            <p className="mb-3 inline-flex rounded-full bg-sage/15 px-3 py-1 text-sm font-medium text-sage-deep">
              {phase === "ongoing" ? t("În desfășurare", "Under way") : t("Încheiat", "Ended")}
            </p>
          )
        }
        data={{
          slug: event.slug,
          title,
          imageUrl: event.image_url,
          descriptionHtml: description
            ? sanitizeArticleHtml(description, {
                // The placeholder stays in, for sanitizeArticleHtml to fill per video.
                play: te("play", { provider: "{provider}" }),
                note: te("note", { provider: "{provider}" }),
              })
            : null,
          schedule,
          location: event.location,
          map: map ? { href: map.href } : null,
          seats: phase === "upcoming" ? { taken, capacity: event.max_participants, isFull } : null,
          calendar: {
            title,
            description: description || "",
            date: event.date,
            time: event.time,
            location: event.location || "",
            endDate: event.end_date,
            endTime: event.end_time,
            url: absoluteUrl(`/${locale}/events/${encodeURIComponent(event.slug)}`),
          },
        }}
        aside={aside}
      >
        {testimonials && testimonials.length > 0 && (
          <section className="mt-12" aria-labelledby="event-testimonials">
            <h2 id="event-testimonials" className="font-serif text-2xl text-charcoal">
              {t("Ce au spus participanții", "What participants said")}
            </h2>
            <ul className="mt-6 space-y-4">
              {testimonials.map((item) => (
                <li key={item.id}>
                  <GlassCard hover={false}>
                    <Quote className="mb-3 h-6 w-6 text-rose-deep/40" aria-hidden="true" />
                    <Rating value={item.rating} locale={locale} />
                    <p className="mt-3 break-words text-charcoal">{item.content}</p>
                    <p className="mt-4 border-t border-sage/20 pt-3 text-sm font-medium text-charcoal">
                      {item.author_name || t("Participantă", "Participant")}
                    </p>
                  </GlassCard>
                </li>
              ))}
            </ul>
          </section>
        )}
      </EventView>
    </div>
  );
}
