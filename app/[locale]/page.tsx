import Image from "next/image";
import { ArrowRight, Quote } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/lib/button-styles";
import { GlassCard } from "@/components/ui/glass-card";
import { Rating } from "@/components/ui/rating";
import { EventCarousel } from "@/components/events/event-carousel";
import {
  EventFeatureCard,
  type FeaturedEvent,
} from "@/components/events/event-feature-card";
import { TextPlaceholder, ImagePlaceholder } from "@/components/ui/content-placeholder";
import { FaqList } from "@/components/faq-list";
import { createPublicClient } from "@/lib/supabase/public";
import { contentText, getSiteContent, getFaqs, placeholderName } from "@/lib/site-content";
import type { SiteContentKey } from "@/lib/site-content-schema";
import { sanitizeHtml } from "@/lib/sanitize";
import { eventStartInstant } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { CARD_COLUMNS } from "@/lib/blog";
import { TEXT_TYPOGRAPHY } from "@/lib/article-typography";
import { PostCard } from "@/components/blog/post-card";
import { eventAvailability } from "@/lib/event-availability";

/**
 * Home page — a server component.
 *
 * REBUILT, AND WHY
 *
 * The previous version was a client component that fetched everything after
 * hydration, so none of its content existed in the HTML. It also led with the
 * blog and pushed events into third place, filled its hero with a placeholder
 * glyph, and stated three invented statistics as fact.
 *
 * The order below follows what someone arriving from an Instagram story
 * actually needs, in the order they need it:
 *
 *   1. Who is this and what is it        — hero, her photograph
 *   2. What can I book, and when         — the next event, above the fold
 *   3. Why should I trust her            — her story
 *   4. What do others say                — testimonials
 *   5. What am I worried about           — FAQ
 *   6. Anything else                     — recent writing
 *
 * Events move from third to second because they are the only thing on this site
 * that earns money, and because a link shared to a story is almost always about
 * a specific event.
 */

/**
 * INERT TODAY, AND KEPT ANYWAY.
 *
 * `next build` reports every route in this app as `ƒ (Dynamic) server-rendered
 * on demand` — there is no `/ro.html` in the build output and nothing but
 * /robots.txt in the prerender manifest. The proxy runs on every request and
 * next-intl resolves the locale from headers, so the whole tree opts out of
 * static rendering and this number currently changes nothing: the page is built
 * fresh for every visitor and her edits appear at once.
 *
 * It stays because the failure mode of deleting it is worse than the failure
 * mode of keeping it. A route that later becomes static-eligible and has no
 * `revalidate` is cached until the next deployment, which would freeze her home
 * page indefinitely; with this line the worst case is five minutes.
 *
 * Do not reason about staleness from its presence. Three comments elsewhere
 * used to, and each described a cache that has never existed on this site.
 */
export const revalidate = 300;

/**
 * How many events the carousel holds.
 *
 * One card is on screen at a time, so this is how far someone can swipe before
 * they run out — not how much the page shows at once. Six is a judgement: enough
 * that the section feels like there is a programme behind it, few enough that
 * "see all events" still has a job, and short enough that nobody swipes into
 * next spring by accident.
 */
const HOME_EVENT_COUNT = 6;

/**
 * How many upcoming events to read before ranking them for the carousel.
 *
 * The ordering below depends on how full each event is, and how full an event
 * is cannot be expressed as a PostgREST `order` — it lives in the
 * `event_availability` view, one row per event. So the ranking happens here,
 * over a bounded window rather than the whole table.
 *
 * The bound is the one compromise: if the next twenty-four events were somehow
 * all full, a twenty-fifth with seats left would not be found. That is not a
 * situation this site can reach, and the alternative is fetching every future
 * event on every home page render.
 */
const EVENT_WINDOW = 24;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const tBlog = await getTranslations({ locale, namespace: "blog" });
  const supabase = createPublicClient();
  // One reading of the clock, used for both the query's date floor and the
  // time-of-day cutoff below. Taking it twice would let a render that straddles
  // midnight filter against two different days.
  const renderedAt = new Date();
  const today = renderedAt.toISOString().split("T")[0];

  const [content, faqs] = await Promise.all([getSiteContent(locale), getFaqs(locale)]);
  /**
   * Every word on this page is hers, from "Conținut site" → "Pagina de start".
   * `text` is what she wrote, or the plain label a heading or button falls
   * back to ("Vezi toate evenimentele"). Her own words with no plain
   * equivalent (the main heading, the introduction) show a dashed placeholder
   * named after the part instead, so an unfinished page looks unfinished
   * rather than borrowing sentences she never wrote.
   */
  const text = (key: SiteContentKey) => contentText(content, key, locale) ?? "";
  const placeholder = (key: SiteContentKey) => placeholderName(key, locale);

  const [{ data: upcoming }, { data: testimonials }, { data: posts }] = await Promise.all([
    supabase
      .from("events")
      // One literal, never concatenated — see the note in CLAUDE.md about what
      // that does to Supabase's type inference.
      .select("id, slug, title_ro, title_en, description_ro, description_en, date, time, end_date, end_time, location, price, currency, image_url")
      .eq("published", true)
      .gte("date", today)
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .limit(EVENT_WINDOW),
    supabase
      .from("testimonials")
      .select("id, content, type, rating, author_name")
      .eq("approved", true)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("blog_posts")
      .select(CARD_COLUMNS)
      .eq("published", true)
      .eq("hidden", false)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const candidates = (upcoming ?? []) as FeaturedEvent[];

  // Seat counts, which decide the ordering below as well as what each card
  // says. Why they come from a view and not from `registrations` is in
  // lib/event-availability.ts.
  const availability = await eventAvailability(supabase, candidates.map((e) => e.id));

  /**
   * Whether this event can still be booked, which decides where it sorts.
   *
   * A capacity of NULL or 0 is sold out rather than uncapped — the reasoning is
   * in components/events/seat-count.tsx and the rule is enforced in
   * supabase/migrations/20260918000000_capacity_is_required.sql.
   *
   * An event with no availability row at all is a different thing: the count
   * could not be read, so nothing is known. It keeps its place by date, because
   * this only decides the order and showing an event that turns out to be full
   * is a smaller failure than burying one that is not.
   */
  const hasRoom = (event: FeaturedEvent) => {
    const info = availability.get(event.id);
    if (!info) return true;
    if (!info.capacity) return false;
    return info.taken < info.capacity;
  };

  /**
   * THE ORDER THE CAROUSEL CYCLES IN
   *
   * Soonest first, except that an event with no seats left gives up its place
   * to a later one somebody can still book. A full event is not hidden — it
   * drops behind every bookable date and only appears if there is room left on
   * the page.
   *
   * So the sequence, from the card that shows first, is: the nearest date with
   * a seat free, then every other bookable date in the order they happen, then
   * the full ones in the order they happen. Two sorted runs, one after the
   * other, which is what the three comparisons below do in one pass — the first
   * splits bookable from full, and the other two order within each run.
   *
   * The reasoning is that this block exists to sell a seat. The nearest date is
   * the most compelling thing to show, right up until the moment it cannot be
   * bought, at which point it is an advert for disappointment and the next
   * available date is worth more.
   *
   * Nothing needs to happen when a seat frees up: `hasRoom` is computed per
   * render from live registration counts, so a cancellation restores that event
   * to its natural place by date on the next render, which is the next request:
   * this page is server-rendered on demand, not cached. See the note on
   * `revalidate` above.
   *
   * The time-of-day filter is here rather than in the query because the cutoff
   * is an instant, not a date: `date >= today` still matches this morning's
   * class at six in the evening. `eventStartInstant` resolves the stored
   * wall-clock time through Europe/Bucharest, so it stays right across the
   * daylight-saving switch.
   */
  const events = candidates
    .filter(
      (event) =>
        eventStartInstant(event.date, event.time).getTime() >= renderedAt.getTime()
    )
    .sort(
      (a, b) =>
        Number(hasRoom(b)) - Number(hasRoom(a)) ||
        a.date.localeCompare(b.date) ||
        // An event with no announced hour sorts to the top of its own day.
        // `time` became nullable so she can publish a date before she knows the
        // hour, and "" sorts before any real "HH:MM".
        (a.time ?? "").localeCompare(b.time ?? "")
    )
    .slice(0, HOME_EVENT_COUNT);

  /**
   * The events section's own strings.
   *
   * The heading is hers (site content); the carousel's controls are
   * interface words and stay here. The carousel is a client component, so its
   * labels have to be handed to it as plain props anyway: a `t` function
   * cannot cross that boundary.
   */
  const ro = locale === "ro";
  const eventStrings = {
    // Singular while there is one event, because "upcoming events" over a lone
    // card reads as a section that failed to load. Plural the moment the
    // carousel can actually move.
    heading: events.length > 1 ? text("home.events_title") : text("home.events_title_one"),
    list: ro ? "Evenimente viitoare" : "Upcoming events",
    previous: ro ? "Evenimentul anterior" : "Previous event",
    next: ro ? "Evenimentul următor" : "Next event",
    position: ro ? "Evenimentul {n} din {total}" : "Event {n} of {total}",
  };

  return (
    <div className="flex flex-col">
      {/* ---------------------------------------------------------------- */}
      {/* 1. Hero — her, not a decorative glyph                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="px-4 pt-8 pb-16 md:pt-16">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 md:grid-cols-2 md:gap-16">
          {/*
           * On a phone the headline comes first and the photograph follows;
           * on desktop the photograph moves back to the left column.
           *
           * A 3:4 portrait at full mobile width is about 520px tall, so
           * image-first meant a visitor arriving from Instagram saw a whole
           * screen of photo and had to scroll before learning what the site
           * even was. Leading with the headline also helps Largest Contentful
           * Paint, since text renders immediately while the image is still
           * downloading.
           */}
          <div className="order-2 relative mx-auto w-full max-w-md md:order-1 md:mx-0">
            {content["home.hero_image"] ? (
              <div className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-xl md:aspect-[3/4]">
                <Image
                  src={content["home.hero_image"]}
                  alt={content["home.hero_image_alt"] ?? ""}
                  fill
                  sizes="(max-width: 768px) 90vw, 45vw"
                  className="object-cover"
                  // The hero image is the largest thing on screen, so it is the
                  // Largest Contentful Paint element. `priority` tells Next to
                  // preload it instead of waiting for layout.
                  priority
                />
              </div>
            ) : (
              <ImagePlaceholder
                label={placeholder("home.hero_image")}
                aspect="aspect-[4/5] md:aspect-[3/4]"
              />
            )}
          </div>

          <div className="order-1 text-center md:order-2 md:text-left">
            <h1 className="font-serif text-4xl leading-tight text-charcoal md:text-6xl">
              {content["home.hero_title"] ?? <TextPlaceholder label={placeholder("home.hero_title")} />}
            </h1>
            <p className="mt-5 text-lg text-charcoal-light md:text-xl">
              {content["home.hero_subtitle"] ?? <TextPlaceholder label={placeholder("home.hero_subtitle")} />}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center md:justify-start">
              <Link href="/events" className={buttonClasses({ size: "lg" })}>{text("home.hero_button_primary")}</Link>
              <Link href="/about" className={buttonClasses({ variant: "secondary", size: "lg" })}>{text("home.hero_button_secondary")}</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2. The next event, as high up the page as it can go              */}
      {/* ---------------------------------------------------------------- */}
      {events.length > 0 ? (
        <section id="events" className="py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center font-serif text-3xl text-charcoal md:text-4xl">
              {eventStrings.heading}
            </h2>

            {/*
              One card at a time, the rest a swipe away.

              This section used to show three events at once: a large card and
              two small ones beneath it. The two that mattered least took two
              thirds of the section, and the card that earns the booking had to
              share the fold with them. Every event now gets the same full-width
              card, and the order above decides which one is standing there when
              the page opens.

              The cards are rendered here, on the server, and handed to the
              carousel as children — so all of them are in the HTML with their
              photographs, prices and links whether or not the JavaScript
              arrives, and whether or not the visitor is a crawler.
            */}
            <EventCarousel
              count={events.length}
              listLabel={eventStrings.list}
              previousLabel={eventStrings.previous}
              nextLabel={eventStrings.next}
              positionLabel={eventStrings.position}
            >
              {events.map((event) => (
                // Deliberately no classes on the <li>: its width and its snap
                // position come from `.event-carousel-track > li`, beside the
                // container that measures them. See app/globals.css.
                <li key={event.id}>
                  <EventFeatureCard
                    event={event}
                    locale={locale}
                    linkText={text("home.event_card_link")}
                    availability={availability.get(event.id)}
                  />
                </li>
              ))}
            </EventCarousel>

            <div className="mt-8 text-center">
              <Link href="/events" className={buttonClasses({ variant: "secondary" })}>
                {text("home.events_button")} <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section id="events" className="py-16">
          <div className="mx-auto max-w-6xl px-4 text-center">
            <h2 className="font-serif text-3xl text-charcoal md:text-4xl">
              {text("home.events_title")}
            </h2>
            <p className="mt-3 text-charcoal-light">{text("home.events_empty")}</p>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 3. Her story — the research is unanimous that people book a       */}
      {/*    teacher rather than a studio                                   */}
      {/* ---------------------------------------------------------------- */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="font-serif text-3xl text-charcoal md:text-4xl">
            {text("home.intro_title")}
          </h2>
          {content["home.intro"] ? (
            <div
              className={`${TEXT_TYPOGRAPHY} mx-auto mt-5 text-lg`}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(content["home.intro"]) }}
            />
          ) : (
            <div className="mt-5">
              <TextPlaceholder label={placeholder("home.intro")} />
            </div>
          )}
          <div className="mt-8">
            <Link href="/about" className={buttonClasses({ variant: "secondary" })}>
                {text("home.intro_button")}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 4. Testimonials                                                   */}
      {/* ---------------------------------------------------------------- */}
      {testimonials && testimonials.length > 0 && (
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center font-serif text-3xl text-charcoal md:text-4xl">
              {text("home.testimonials_title")}
            </h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {/* Not a link, so it does not lift — see the note on the same
                  card in app/[locale]/testimonials/page.tsx. */}
              {testimonials.map((item) => (
                <GlassCard key={item.id} hover={false} className="flex h-full flex-col">
                  <Quote className="h-6 w-6 text-rose-deep/40" aria-hidden="true" />
                  {/* Nothing is drawn when the rating is null — see the note in
                      components/ui/rating.tsx. A quote with no stars beside it
                      is honest; five default stars are not. */}
                  <Rating value={item.rating} locale={locale} className="mt-3" />
                  {/* `flex-1` pushes the attribution to the bottom, so the rule
                      above it lines up across a row of cards whose quotes are
                      different lengths. */}
                  <p className="mt-3 flex-1 text-charcoal">{item.content}</p>
                  <p className="mt-4 border-t border-sage/20 pt-3 text-sm font-medium text-charcoal">
                    {item.author_name ||
                      (locale === "ro" ? "Participantă" : "Participant")}
                  </p>
                </GlassCard>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link href="/testimonials" className={buttonClasses({ variant: "secondary" })}>
                  {text("home.testimonials_button")}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 5. FAQ — answers the practical worries that stall a booking       */}
      {/* ---------------------------------------------------------------- */}
      {faqs.length > 0 && (
        <section className="py-16">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="text-center font-serif text-3xl text-charcoal md:text-4xl">
              {text("home.faq_title")}
            </h2>
            <div className="mt-8">
              <FaqList faqs={faqs} />
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 6. Recent writing                                                 */}
      {/* ---------------------------------------------------------------- */}
      {posts && posts.length > 0 && (
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center font-serif text-3xl text-charcoal md:text-4xl">
              {text("home.blog_title")}
            </h2>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <li key={post.id} className="min-w-0">
                  <PostCard
                    post={post}
                    locale={locale}
                    headingLevel={3}
                    readingTime={(minutes) => tBlog("reading_time", { minutes })}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-8 text-center">
              <Link href="/blog" className={buttonClasses({ variant: "secondary" })}>
                  {text("home.blog_button")} <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
            </div>
          </div>
        </section>
      )}

    </div>
  );
}

