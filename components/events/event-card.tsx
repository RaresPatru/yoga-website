import Image from "next/image";
import { Calendar, Clock, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { SeatCount } from "@/components/events/seat-count";
import { formatEventSchedule } from "@/lib/utils";
import { formatPrice } from "@/lib/money";
import { toPlainText } from "@/lib/plain-text";
import { canOptimise } from "@/lib/image-src";
import type { EventPhase } from "@/lib/event-phase";
import type { Availability } from "@/lib/event-availability";

export interface CardEvent {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  description_ro: string | null;
  description_en: string | null;
  date: string;
  time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  price: number;
  currency: string | null;
  image_url: string | null;
}

/**
 * An event as a card on /events. The whole card is the link, so it takes the
 * card hover (GlassCard) and nothing inside is separately clickable.
 *
 * What the foot of the card says follows the event's life: the price and the
 * seats before it starts, "În desfășurare" once it has, and nothing but the
 * date and place once it is over, in the archive.
 */
export function EventCard({
  event,
  locale,
  phase,
  availability,
  labels,
  headingLevel = 2,
}: {
  event: CardEvent;
  locale: string;
  phase: EventPhase;
  availability?: Availability;
  labels: { free: string; ongoing: string };
  headingLevel?: 2 | 3;
}) {
  const title = locale === "ro" ? event.title_ro : event.title_en || event.title_ro;
  // One place decides how a date and an hour are said, so the card here, the
  // carousel slide on the home page and the event page itself cannot drift.
  const schedule = formatEventSchedule(event, locale);
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <Link href={`/events/${event.slug}`} className="block h-full rounded-2xl">
      <GlassCard className="group flex h-full flex-col">
        {event.image_url && (
          /*
            Left, top and right: the photograph is the card's lid. `-3`
            against the card's `p-6` leaves it a little proud of the text
            without reaching the edge, which it cannot do for the reason in
            components/events/event-feature-card.tsx: the card's
            backdrop-filter defeats rounded overflow clipping.
          */
          <div className="relative -mx-3 -mt-3 mb-4 aspect-[3/2] overflow-hidden rounded-xl bg-sage/10">
            <Image
              src={event.image_url}
              unoptimized={!canOptimise(event.image_url)}
              alt={title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              // The photograph answers the hover: a slow push-in inside the
              // rounded frame while the card lifts. `scale-100` is the resting
              // identity (GlassCard explains why), and `motion-safe:` means the
              // zoom never exists for someone who asked for less motion.
              className={`object-cover scale-100 transition-transform duration-500 ease-out motion-safe:group-hover:scale-105 ${
                phase === "ended" ? "saturate-[0.85]" : ""
              }`}
            />
          </div>
        )}
        <Heading className="font-serif text-xl text-charcoal break-words">{title}</Heading>
        {phase !== "ended" && (
          // Stripped of markup: the column holds HTML, which the event page
          // renders and which this card would otherwise print.
          <p className="mb-4 mt-2 line-clamp-2 text-sm text-charcoal-light">
            {toPlainText(locale === "ro" ? event.description_ro : event.description_en || event.description_ro)}
          </p>
        )}
        <div className={`flex flex-wrap gap-3 text-sm text-charcoal-light ${phase === "ended" ? "mt-2" : ""}`}>
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> {schedule.date}
          </span>
          {/* No clock at all when she has not announced an hour. */}
          {schedule.time && phase !== "ended" && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {schedule.time}
            </span>
          )}
          {event.location && (
            <span className="flex items-center gap-1">
              {/* Optically matched to the h-3.5 icons beside it: see the
                  note on the same icon in the feature card. */}
              <MapPin className="h-[16px] w-[16px]" aria-hidden="true" /> {event.location}
            </span>
          )}
        </div>
        {phase === "upcoming" && (
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
            <span className="rounded-full bg-rose/10 px-3 py-1 text-sm font-medium text-rose-deep">
              {event.price === 0 ? labels.free : formatPrice(event.price, event.currency, locale)}
            </span>
            <SeatCount locale={locale} info={availability} compact />
          </div>
        )}
        {phase === "ongoing" && (
          <div className="mt-auto pt-4">
            <span className="rounded-full bg-sage/15 px-3 py-1 text-sm font-medium text-sage-deep">{labels.ongoing}</span>
          </div>
        )}
      </GlassCard>
    </Link>
  );
}
