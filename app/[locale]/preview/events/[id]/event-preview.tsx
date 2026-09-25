"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { eventStartInstant, formatEventSchedule } from "@/lib/utils";
import { eventPhase, type EventPhase } from "@/lib/event-phase";
import { mapTarget } from "@/lib/map-link";
import { toCurrency } from "@/lib/money";
import { absoluteUrl } from "@/lib/site-config";
import { EventRegistration } from "@/components/events/event-registration";
import { BookingClosed, EventView, type EventViewData } from "@/components/events/event-view";

/** The day after an ISO date, for an end with no stated hour (the database's rule). */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

type State =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; data: EventViewData; phase: EventPhase; booking: { price: number; currency: string; capacity: number | null; taken: number; whatsapp: string | null; eventId: string } };

/**
 * Reads the event and its private changes as the signed-in admin and draws the
 * result with the public page's own component. Its start and end are worked
 * out here, the way Postgres works them out for the stored event, because the
 * unpublished date is not stored on the event yet.
 *
 * The booking panel is drawn inert: it shows what visitors will see, and
 * cannot take a booking from the preview.
 */
export function EventPreview({ id, locale }: { id: string; locale: string }) {
  const tp = useTranslations("preview");
  const te = useTranslations("embed");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: event } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
      if (!event) {
        if (!cancelled) setState({ kind: "unavailable" });
        return;
      }
      const [{ data: draft }, { data: availability }] = await Promise.all([
        supabase.from("content_drafts").select("data").eq("event_id", id).maybeSingle(),
        supabase.from("event_availability").select("taken").eq("event_id", id).maybeSingle(),
      ]);
      const e = { ...event, ...((draft?.data as Partial<typeof event> | undefined) ?? {}) };

      const startsAt = eventStartInstant(e.date, e.time).toISOString();
      const endsAt = (
        e.end_time
          ? eventStartInstant(e.end_date || e.date, e.end_time)
          : eventStartInstant(nextDay(e.end_date || e.date), null)
      ).toISOString();
      const phase = eventPhase(startsAt, endsAt);
      const en = locale === "en";
      const title = (en && e.title_en?.trim()) || e.title_ro;
      const description = (en && e.description_en?.trim()) || e.description_ro;
      const taken = availability?.taken ?? 0;
      const map = mapTarget(e.map_link);

      if (cancelled) return;
      setState({
        kind: "ready",
        phase,
        booking: {
          price: e.price,
          currency: toCurrency(e.currency),
          capacity: e.max_participants,
          taken,
          whatsapp: e.whatsapp_group_link,
          eventId: e.id,
        },
        data: {
          slug: e.slug,
          title,
          imageUrl: e.image_url,
          descriptionHtml: description
            ? sanitizeArticleHtml(description, {
                play: te("play", { provider: "{provider}" }),
                note: te("note", { provider: "{provider}" }),
              })
            : null,
          schedule: formatEventSchedule(e, locale),
          location: e.location,
          map: map ? { href: map.href } : null,
          seats:
            phase === "upcoming"
              ? { taken, capacity: e.max_participants, isFull: !e.max_participants || taken >= e.max_participants }
              : null,
          calendar: {
            title,
            description: description || "",
            date: e.date,
            time: e.time,
            location: e.location || "",
            endDate: e.end_date,
            endTime: e.end_time,
            url: absoluteUrl(`/${locale}/events/${encodeURIComponent(e.slug)}`),
          },
        },
      });
    })().catch(() => {
      if (!cancelled) setState({ kind: "unavailable" });
    });
    return () => {
      cancelled = true;
    };
  }, [id, locale, te]);

  if (state.kind === "loading") return <div className="min-h-[60vh]" aria-busy="true" />;
  if (state.kind === "unavailable") {
    return <p className="mx-auto max-w-xl px-4 py-24 text-center text-charcoal-light">{tp("unavailable")}</p>;
  }

  const t = (ro: string, en: string) => (locale === "ro" ? ro : en);
  const { data, phase, booking } = state;

  return (
    <>
      <p className="flex items-center justify-center gap-2 bg-sage/15 px-4 py-2 text-center text-sm text-sage-deep">
        <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
        {tp("banner")}
      </p>
      <div className="mx-auto max-w-7xl px-4 py-12">
        <EventView
          data={data}
          locale={locale}
          status={
            phase === "upcoming" ? null : (
              <p className="mb-3 inline-flex rounded-full bg-sage/15 px-3 py-1 text-sm font-medium text-sage-deep">
                {phase === "ongoing" ? t("În desfășurare", "Under way") : t("Încheiat", "Ended")}
              </p>
            )
          }
          aside={
            phase === "upcoming" ? (
              // Drawn as visitors will see it, and inert: a preview books nobody.
              <div inert>
                <EventRegistration
                  eventId={booking.eventId}
                  price={booking.price}
                  currency={booking.currency}
                  maxParticipants={booking.capacity}
                  taken={booking.taken}
                  whatsappLink={booking.whatsapp}
                  locale={locale}
                />
              </div>
            ) : (
              <BookingClosed
                heading={
                  phase === "ongoing"
                    ? t("Evenimentul este în desfășurare", "This event is under way")
                    : t("Evenimentul s-a încheiat", "This event has ended")
                }
                body={
                  phase === "ongoing"
                    ? t("Înscrierile s-au închis când a început.", "Bookings closed when it began.")
                    : t("Înscrierile s-au închis.", "Bookings are closed.")
                }
              />
            )
          }
        />
      </div>
    </>
  );
}
