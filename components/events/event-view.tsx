import type { ReactNode } from "react";
import Image from "next/image";
import { Clock, MapPin, Users } from "lucide-react";
import { ShareButton } from "@/components/ui/share-button";
import { EventDateLink } from "@/components/events/event-date-link";
import { RichHtml } from "@/components/rich-html";
import { TEXT_TYPOGRAPHY } from "@/lib/article-typography";
import { META_LINK } from "@/lib/meta-link";
import { canOptimise } from "@/lib/image-src";

/** What the event page shows, already in the reader's language. */
export interface EventViewData {
  slug: string;
  title: string;
  imageUrl: string | null;
  /** Already through sanitizeArticleHtml. */
  descriptionHtml: string | null;
  schedule: { date: string; time: string | null };
  location: string | null;
  /** Where the address leads, when she supplied a map link (lib/map-link.ts). */
  map: { href: string } | null;
  /** Seats, while booking can still be open; null once it has closed. */
  seats: { taken: number; capacity: number | null; isFull: boolean } | null;
  /** What the add-to-calendar menu needs (components/events/event-date-link.tsx). */
  calendar: Parameters<typeof EventDateLink>[0]["event"];
}

/**
 * An event's page, below the header: its photograph, title and Share button,
 * the date, time, address and seats, the description, and whatever goes
 * beside it (`aside`: the booking panel, or the notice that booking has
 * closed) and under it (`children`: the testimonials of a past event).
 *
 * Drawn by the public event page and by the preview (which feeds it the
 * unpublished version), so the preview cannot drift from the real thing. No
 * hooks, so either may render it.
 */
export function EventView({
  data,
  locale,
  status,
  aside,
  children,
}: {
  data: EventViewData;
  locale: string;
  /** A line above the title saying the event is under way or over. */
  status?: ReactNode;
  aside: ReactNode;
  children?: ReactNode;
}) {
  const t = (ro: string, en: string) => (locale === "ro" ? ro : en);

  return (
    /*
      `min-w-0` on both columns.

      A grid item defaults to `min-width: auto`, meaning it refuses to shrink
      below the widest thing inside it. Anything unshrinkable — a long URL in
      the description, a wide embed, or the phone field that actually caused
      this — therefore does not overflow its own column; it widens the column,
      then the grid, then the page. The symptom is the entire event page
      scrolling sideways on a phone, which is how it was found: 435px of
      layout on a 390px screen, with the header stretched along with it.
    */
    <div className="grid gap-12 md:grid-cols-5">
      <div className="min-w-0 md:col-span-3">
        {data.imageUrl && (
          <div className="relative mb-8 aspect-video overflow-hidden rounded-3xl bg-sage/10">
            <Image
              src={data.imageUrl}
              unoptimized={!canOptimise(data.imageUrl)}
              alt={data.title}
              fill
              sizes="(max-width: 768px) 100vw, 60vw"
              className="object-cover"
              priority
            />
          </div>
        )}

        {status}

        <div className="flex items-start justify-between gap-4">
          {/*
            `min-w-0 break-words` because the title is whatever the instructor
            typed. A flex item will not shrink below its longest unbreakable
            word, and the share button beside it refuses to wrap, so one long
            token — a hashtag, a URL, a compound word — pushed this row past
            the screen edge and took the whole page with it.
          */}
          <h1 className="min-w-0 break-words font-serif text-4xl text-charcoal md:text-5xl">{data.title}</h1>
          <ShareButton title={data.title} />
        </div>

        {/*
          Two of these four do something and two are facts. The two that do
          carry an icon, an underline and a darker ink — see lib/meta-link.ts
          for why it takes all three on a device with no hover.
        */}
        <div className="mt-6 flex flex-wrap gap-4 text-sm text-charcoal-light">
          <EventDateLink
            slug={data.slug}
            locale={locale}
            dateText={data.schedule.date}
            addLabel={t("Adaugă în calendar", "Add to calendar")}
            // The only one of the three whose name is not a brand everybody
            // recognises, so it says what the file is as well as what opens it.
            appleLabel={t("Apple Calendar (.ics)", "Apple Calendar (.ics)")}
            event={data.calendar}
          />
          {/* `whitespace-nowrap` because the thin spaces around the en dash
              are breaking spaces, so a narrow enough column would put the end
              time on its own line and leave a dash hanging. */}
          {data.schedule.time && (
            <span className="flex items-center gap-2 whitespace-nowrap">
              {/* A range once she has said when it ends, the start alone
                  until then, and nothing at all until she has announced an
                  hour — none of the three is ever a guess. */}
              <Clock className="h-4 w-4" aria-hidden="true" />
              {data.schedule.time}
            </span>
          )}
          {/*
            The address opens a map when she has supplied one, and is plain
            text when she has not. Deliberately only here: on the home page
            and the events index the whole card is already a link, and a link
            inside a link is invalid HTML that browsers repair by closing the
            outer one early.

            `rel="noopener noreferrer"` because this leaves the site, and
            `target="_blank"` so somebody who came to read about the event
            still has it open when they come back from the map.
          */}
          {data.location &&
            (data.map ? (
              <a
                href={data.map.href}
                target="_blank"
                rel="noopener noreferrer"
                data-tooltip={t("Vezi pe hartă", "View on the map")}
                // The address stays inside the name rather than being replaced
                // by it: WCAG 2.5.3 wants the visible label in the accessible
                // name, and somebody listening still needs to hear where it is.
                aria-label={`${data.location} — ${t("vezi pe hartă", "view on the map")}`}
                className={META_LINK}
              >
                <MapPin className="h-4 w-4" aria-hidden="true" /> {data.location}
              </a>
            ) : (
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" aria-hidden="true" /> {data.location}
              </span>
            ))}
          {/* NULL or 0 capacity reads as sold out; the fraction only ever runs
              when there is a real number to put in it. Once booking has closed
              the seats are not news any more, so the line goes. */}
          {data.seats && (
            <span className={`flex items-center gap-2 ${data.seats.isFull ? "text-error" : ""}`}>
              <Users className="h-4 w-4" aria-hidden="true" />
              {data.seats.isFull
                ? /* One phrase for one state, site-wide: components/events/seat-count.tsx
                     is where that vocabulary is decided. */
                  t("Locuri epuizate", "Sold out")
                : t("{filled}/{total} locuri", "{filled}/{total} spots")
                    .replace("{filled}", String(data.seats.taken))
                    .replace("{total}", String(data.seats.capacity))}
            </span>
          )}
        </div>

        {data.descriptionHtml && (
          // TEXT_TYPOGRAPHY breaks words: this is instructor-written HTML and
          // may contain a bare URL, one long unbreakable token. Videos wait
          // for a press, as in a blog post (sanitizeArticleHtml).
          <RichHtml className={`${TEXT_TYPOGRAPHY} blog-content mt-8`} html={data.descriptionHtml} />
        )}

        {children}
      </div>

      <div className="min-w-0 md:col-span-2">{aside}</div>
    </div>
  );
}

/**
 * The notice in place of the booking panel once booking has closed: the event
 * is under way, or over. Says so plainly and points to what is next.
 */
export function BookingClosed({
  heading,
  body,
  action,
}: {
  heading: string;
  body: string;
  /** A link onward, such as to the events that are still to come. */
  action?: ReactNode;
}) {
  return (
    <div className="sticky top-24 rounded-2xl border border-sage/30 bg-warm-white p-6 text-center">
      <h2 className="font-serif text-2xl text-charcoal">{heading}</h2>
      <p className="mt-3 text-charcoal-light">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
