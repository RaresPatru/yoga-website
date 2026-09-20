import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Calendar, Clock, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { SeatCount } from "@/components/events/seat-count";
import type { Availability } from "@/lib/event-availability";
import { formatEventSchedule } from "@/lib/utils";
import { toPlainText } from "@/lib/metadata";
import { formatPrice } from "@/lib/money";

/**
 * The fields this card draws. Narrower than the `events` row on purpose: a
 * component that names what it needs is a component whose caller cannot quietly
 * stop selecting a column it depends on.
 */
export interface FeaturedEvent {
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
 * The home page's event card — photograph on the left, everything else on the
 * right, the whole thing one link.
 *
 * WHY IT IS ITS OWN FILE NOW
 *
 * The home page used to draw two different cards: this one for the next event
 * and a smaller one, twice, for the two after it. The section shows one event at
 * a time and cycles through the rest, so every event gets the big treatment and
 * there is exactly one card left to describe. Repeating it inline six times was
 * the alternative.
 *
 * The events index (app/[locale]/events/page.tsx) keeps its own, smaller card.
 * That one lives in a three-column grid and answers a different question —
 * "what else is coming up" rather than "what should I book" — so the two are
 * different on purpose rather than by neglect.
 *
 * A Server Component, and the carousel around it is not. That split is the
 * point: every card is in the HTML with its photograph, its price and its link,
 * so a crawler and a visitor whose JavaScript has not arrived yet both get the
 * whole list. Only the ~90 lines that move it sideways are shipped.
 */
export async function EventFeatureCard({
  event,
  locale,
  availability,
}: {
  event: FeaturedEvent;
  locale: string;
  availability?: Availability;
}) {
  const t = await getTranslations("home");
  const title = locale === "ro" ? event.title_ro : event.title_en || event.title_ro;
  /*
   * As text, not as markup. The column holds HTML — the event page renders it
   * through sanitizeHtml + dangerouslySetInnerHTML — so printing it straight
   * into a paragraph here showed the tags to the visitor, and the two surfaces
   * disagreed about what the same column was.
   *
   * Stripped rather than rendered: this is a three-line summary inside a card
   * that is entirely one link, and putting block elements or a nested anchor in
   * there is invalid markup that browsers recover from in their own ways.
   */
  const description = toPlainText(
    locale === "ro" ? event.description_ro : event.description_en || event.description_ro
  );
  // Shared with the events index and the event page, so the three cannot
  // disagree about how a date or an hour is written.
  const schedule = formatEventSchedule(event, locale);

  return (
    <Link
      href={`/events/${event.slug}`}
      // `rounded-2xl` to match the GlassCard inside it: the focus outline
      // follows the focused element's own radius, so a 24px link around a 16px
      // card draws corners that miss the card.
      className="group block rounded-2xl md:h-full"
    >
      <GlassCard className="overflow-hidden md:h-full">
        {/*
          `md:items-center` because the photograph is what sets the card's
          height and the text beside it does not fill that. Left to stretch, the
          column sat at the top with the slack collected underneath it, which
          read as a card that had failed to load the rest of itself. Centred, the
          same slack is margin.

          The photograph was a square here, which at a fifth of a 1120px card is
          433px tall against roughly 250px of text — a third of every card was
          void. That was survivable while this was the only card on the page;
          the carousel makes every slide as tall as the tallest, so it became
          the whole section. 4:3 keeps enough height for a portrait crop while
          landing much closer to what the text actually needs.

          All three of those are `md:` only, and that is the point. Stacked on a
          phone there is no column beside anything to line up with, and a card
          for an event with no photograph would be a short paragraph floating in
          the middle of a tall empty box — nearly two hundred pixels of nothing
          above and below it, measured. Below `md` the card simply ends where its
          content ends; the track handles the rest, and the reasoning for that
          is in app/globals.css on `.event-carousel-track`. She will meet this —
          an event usually exists before its photograph does.
        */}
        <div className="grid gap-6 md:h-full md:grid-cols-5 md:content-center md:items-center">
          {event.image_url && (
            /*
              The photograph reaches half way into the card's padding.

              `GlassCard` sets `p-6`, so `-3` here — twelve pixels against the
              card's twenty-four — gives the photograph half that margin and
              leaves the other half. It sits a little proud of the text beside
              it without touching the edge.

              IT USED TO GO ALL THE WAY, AND COULD NOT

              A full bleed meant cancelling the whole `p-6` and letting the card
              clip the corners, which is the ordinary way to do this and does
              not work here: `GlassCard` carries `backdrop-blur-xl`, and an
              element with a backdrop-filter is promoted to its own compositing
              layer, after which its `overflow: hidden` clips descendants to a
              plain rectangle and ignores the `border-radius`. The photograph
              kept its square corners inside the card's rounded ones, with a
              sliver of card showing through each. Nothing in the markup says
              so, and no style assertion catches it — it has to be looked at.

              Keeping the photograph inside the radius sidesteps the whole
              thing, and its own `rounded-xl` then reads as concentric with the
              card's `rounded-2xl` rather than fighting it.
            */
            <div className="relative -mx-3 -mt-3 aspect-video overflow-hidden rounded-xl md:col-span-2 md:mx-0 md:-my-3 md:-ml-3 md:aspect-[4/3]">
              <Image
                src={event.image_url}
                alt={title}
                fill
                sizes="(max-width: 768px) 100vw, 40vw"
                className="object-cover scale-100 transition-transform duration-500 ease-out motion-safe:group-hover:scale-105"
              />
            </div>
          )}
          <div className={`text-center ${event.image_url ? "md:col-span-3" : "md:col-span-5"}`}>
            <h3 className="font-serif text-2xl text-charcoal md:text-3xl">{title}</h3>

            {/*
              Three lines and then it stops.

              She writes these in a plain textarea with no length limit, so the
              long ones would otherwise decide how tall the card is — and in a
              carousel every slide is the height of the tallest, which means one
              rambling description adds white space to every other event. Three
              lines is enough to say what a session is; the rest is what the
              event page is for.

              `line-clamp` needs a fixed number of lines to count, so this cannot
              be expressed as a height. The ellipsis is the browser's.
            */}
            {description && (
              <p className="mt-3 line-clamp-3 text-charcoal-light">{description}</p>
            )}

            <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-charcoal-light">
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                {/* A day, or a run of them: "26 – 28 octombrie 2026". */}
                {schedule.date}
              </span>
              {/* No clock at all until she has announced an hour. An empty one
                  beside a date reads as something that failed to load. */}
              {schedule.time && (
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  {schedule.time}
                </span>
              )}
              {event.location && (
                <span className="flex items-center gap-2">
                  {/*
                    A shade larger than the calendar and the clock beside it,
                    which are `h-4`. Not an inconsistency: those two fill their
                    box — a square and a circle — while a map pin is a narrow
                    teardrop with empty corners, so at a matching box size it
                    carries visibly less ink and reads as smaller. Two pixels
                    evens out what the eye sees rather than what the numbers say.
                  */}
                  <MapPin className="h-[18px] w-[18px]" aria-hidden="true" />
                  {event.location}
                </span>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <span className="rounded-full bg-rose/15 px-4 py-1.5 font-medium text-rose-deep">
                {event.price === 0
                  ? t("free")
                  : formatPrice(event.price, event.currency, locale)}
              </span>
              <SeatCount locale={locale} info={availability} />
            </div>

            <p className="mt-6 inline-flex items-center gap-2 font-medium text-rose-deep">
              {locale === "ro" ? "Vezi detalii și rezervă" : "See details and book"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </p>
          </div>
        </div>
      </GlassCard>
    </Link>
  );
}
