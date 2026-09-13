import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Calendar, Clock, MapPin, Quote } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/lib/button-styles";
import { GlassCard } from "@/components/ui/glass-card";
import { Rating } from "@/components/ui/rating";
import { SeatCount } from "@/components/events/seat-count";
import { TextPlaceholder, ImagePlaceholder } from "@/components/ui/content-placeholder";
// Disabled — see the note at <StickyCta /> near the bottom of this file.
// import { StickyCta } from "@/components/sticky-cta";
import { FaqList } from "@/components/faq-list";
import { createPublicClient } from "@/lib/supabase/public";
import { getSiteContent, getFaqs } from "@/lib/site-content";
import { sanitizeHtml } from "@/lib/sanitize";
import { formatDate, formatTime, eventStartInstant } from "@/lib/utils";
import { eventAvailability } from "@/lib/event-availability";
import { formatPrice } from "@/lib/money";

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

/** How many events the page shows: one lead card and two beneath it. */
const HOME_EVENT_COUNT = 3;

/**
 * How many upcoming events to consider before picking those three.
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

interface EventCard {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  date: string;
  time: string;
  location: string | null;
  price: number;
  currency: string | null;
  max_participants: number | null;
  image_url: string | null;
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("home");
  const supabase = createPublicClient();
  // One reading of the clock, used for both the query's date floor and the
  // time-of-day cutoff below. Taking it twice would let a render that straddles
  // midnight filter against two different days.
  const renderedAt = new Date();
  const today = renderedAt.toISOString().split("T")[0];

  const [content, faqs] = await Promise.all([getSiteContent(locale), getFaqs(locale)]);

  const [{ data: upcoming }, { data: testimonials }, { data: posts }] = await Promise.all([
    supabase
      .from("events")
      .select("id, slug, title_ro, title_en, date, time, location, price, currency, max_participants, image_url")
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
      .select("id, slug, title_ro, title_en, created_at")
      .eq("published", true)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const candidates = (upcoming ?? []) as EventCard[];

  // Seat counts, which decide the ordering below as well as what each card
  // says. Why they come from a view and not from `registrations` is in
  // lib/event-availability.ts.
  const availability = await eventAvailability(supabase, candidates.map((e) => e.id));

  /**
   * An uncapped event always has room. So does one whose seat count could not
   * be read — showing an event that turns out to be full is a smaller failure
   * than hiding one that is not.
   */
  const hasRoom = (event: EventCard) => {
    const info = availability.get(event.id);
    if (!info?.capacity) return true;
    return info.taken < info.capacity;
  };

  /**
   * WHICH THREE EVENTS THE PAGE LEADS WITH
   *
   * Soonest first, except that an event with no seats left gives up its place
   * to a later one somebody can still book. A full event is not hidden — it
   * drops behind every bookable date and only appears if there is room left on
   * the page.
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
        a.time.localeCompare(b.time)
    )
    .slice(0, HOME_EVENT_COUNT);

  const title = (e: EventCard) =>
    locale === "ro" ? e.title_ro : e.title_en || e.title_ro;
  const [nextEvent, ...laterEvents] = events;

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
                  alt={content["home.hero_title"] ?? ""}
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
                label="Fotografia ta principală — adaugă din panoul de administrare"
                aspect="aspect-[4/5] md:aspect-[3/4]"
              />
            )}
          </div>

          <div className="order-1 text-center md:order-2 md:text-left">
            <h1 className="font-serif text-4xl leading-tight text-charcoal md:text-6xl">
              {content["home.hero_title"] ?? t("hero_title")}
            </h1>
            <p className="mt-5 text-lg text-charcoal-light md:text-xl">
              {content["home.hero_subtitle"] ?? t("hero_subtitle")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center md:justify-start">
              <Link href="/events" className={buttonClasses({ size: "lg" })}>{t("cta")}</Link>
              <Link href="/about" className={buttonClasses({ variant: "secondary", size: "lg" })}>{locale === "ro" ? "Despre mine" : "About me"}</Link>
            </div>
            {/*
              A zero-height marker directly below the hero buttons.
              <StickyCta> watches it to decide when the floating "book now" bar
              is worth showing: while this is still on screen the real call to
              action is too, and a second copy of it floating over the page is
              just clutter. Marking the end of the hero rather than measuring a
              scroll distance means it stays correct when the headline wraps to
              a different number of lines.
            */}
            <div id="hero-cta-end" aria-hidden="true" className="h-px w-full" />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2. The next event, as high up the page as it can go              */}
      {/* ---------------------------------------------------------------- */}
      {nextEvent ? (
        <section id="events" className="py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="font-serif text-3xl text-charcoal md:text-4xl">
              {locale === "ro" ? "Următorul eveniment" : "Next event"}
            </h2>

            <Link
              href={`/events/${nextEvent.slug}`}
              // `rounded-2xl` to match the GlassCard inside it: the focus
              // outline follows the focused element's own radius, so a 24px
              // link around a 16px card draws corners that miss the card.
              className="group mt-6 block rounded-2xl"
            >
              <GlassCard
                className="overflow-hidden"
              >
                <div className="grid gap-6 md:grid-cols-5">
                  {nextEvent.image_url && (
                    <div className="relative aspect-video overflow-hidden rounded-2xl md:col-span-2 md:aspect-square">
                      <Image
                        src={nextEvent.image_url}
                        alt={title(nextEvent)}
                        fill
                        sizes="(max-width: 768px) 90vw, 40vw"
                        className="object-cover scale-100 transition-transform duration-500 ease-out motion-safe:group-hover:scale-105"
                      />
                    </div>
                  )}
                  <div className={nextEvent.image_url ? "md:col-span-3" : "md:col-span-5"}>
                    <h3 className="font-serif text-2xl text-charcoal md:text-3xl">
                      {title(nextEvent)}
                    </h3>
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-charcoal-light">
                      <span className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" aria-hidden="true" />
                        {formatDate(nextEvent.date, locale)}
                      </span>
                      <span className="flex items-center gap-2">
                        <Clock className="h-4 w-4" aria-hidden="true" />
                        {formatTime(nextEvent.time)}
                      </span>
                      {nextEvent.location && (
                        <span className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" aria-hidden="true" />
                          {nextEvent.location}
                        </span>
                      )}
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-rose/15 px-4 py-1.5 font-medium text-rose-deep">
                        {nextEvent.price === 0 ? t("free") : formatPrice(nextEvent.price, nextEvent.currency, locale)}
                      </span>
                      <SeatCount
                        locale={locale}
                        info={availability.get(nextEvent.id)}
                      />
                    </div>
                    <p className="mt-6 inline-flex items-center gap-2 font-medium text-rose-deep">
                      {locale === "ro" ? "Vezi detalii și rezervă" : "See details and book"}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </p>
                  </div>
                </div>
              </GlassCard>
            </Link>

            {laterEvents.length > 0 && (
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                {laterEvents.map((event) => (
                  <Link key={event.id} href={`/events/${event.slug}`} className="group block rounded-2xl">
                    <GlassCard
                      className="h-full"
                    >
                      {/* These two cards used to drop the photograph entirely,
                          so an event with one looked different depending on
                          which page you met it on. The lead card above and the
                          events index both show it; so do these now. */}
                      {event.image_url && (
                        <div className="relative mb-4 aspect-video w-full overflow-hidden rounded-xl bg-sage/10">
                          <Image
                            src={event.image_url}
                            alt={title(event)}
                            fill
                            sizes="(max-width: 640px) 90vw, 45vw"
                            className="object-cover scale-100 transition-transform duration-500 ease-out motion-safe:group-hover:scale-105"
                          />
                        </div>
                      )}
                      <h3 className="font-serif text-lg text-charcoal">{title(event)}</h3>
                      <div className="mt-3 flex flex-wrap gap-3 text-sm text-charcoal-light">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                          {formatDate(event.date, locale)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {formatTime(event.time)}
                        </span>
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <span className="rounded-full bg-rose/15 px-3 py-1 text-sm font-medium text-rose-deep">
                          {event.price === 0 ? t("free") : formatPrice(event.price, event.currency, locale)}
                        </span>
                        <SeatCount
                          locale={locale}
                          info={availability.get(event.id)}
                          compact
                        />
                      </div>
                    </GlassCard>
                  </Link>
                ))}
              </div>
            )}

            <div className="mt-8">
              <Link href="/events" className={buttonClasses({ variant: "secondary" })}>
                  {t("view_all_events")} <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
            </div>
          </div>
        </section>
      ) : (
        <section id="events" className="py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="font-serif text-3xl text-charcoal">{t("events_title")}</h2>
            <p className="mt-3 text-charcoal-light">
              {locale === "ro"
                ? "Momentan nu sunt evenimente programate. Revino curând."
                : "No events scheduled right now. Check back soon."}
            </p>
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
            {locale === "ro" ? "Cine sunt" : "Who I am"}
          </h2>
          {content["home.intro"] ? (
            <div
              className="prose prose-sage mx-auto mt-5 max-w-none text-lg text-charcoal-light"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(content["home.intro"]) }}
            />
          ) : (
            <div className="mt-5">
              <TextPlaceholder label="Scurtă prezentare (2–3 fraze) — adaugă din panoul de administrare" />
            </div>
          )}
          <div className="mt-8">
            <Link href="/about" className={buttonClasses({ variant: "secondary" })}>
                {locale === "ro" ? "Citește povestea mea" : "Read my story"}
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
              {t("testimonials_title")}
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
                  {t("view_all_testimonials")}
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
              {locale === "ro" ? "Întrebări frecvente" : "Frequently asked questions"}
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
              {t("blog_title")}
            </h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-3">
              {posts.map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`} className="block rounded-2xl">
                  <GlassCard
                    className="h-full"
                  >
                    <h3 className="font-serif text-lg text-charcoal">
                      {locale === "ro" ? post.title_ro : post.title_en || post.title_ro}
                    </h3>
                    <p className="mt-2 text-sm text-charcoal-light">
                      {formatDate(post.created_at, locale)}
                    </p>
                  </GlassCard>
                </Link>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link href="/blog" className={buttonClasses({ variant: "secondary" })}>
                  {t("view_all_posts")} <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
            </div>
          </div>
        </section>
      )}

      {/*
        The floating "book now" bar is switched off for now, at the owner's
        request. Left commented rather than deleted because the component and
        its tests are intact and this is the only line that turns it back on:

            <StickyCta />

        To re-enable: uncomment the line above, restore the import at the top of
        this file, and change `test.describe.skip` back to `test.describe` in
        tests/public-home.spec.ts. The `#hero-cta-end` marker below the hero
        buttons is what the bar watches to decide when to appear; it costs
        nothing and stays put.
      */}
    </div>
  );
}

