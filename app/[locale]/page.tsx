import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Calendar, Clock, MapPin, Users, Quote } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/lib/button-styles";
import { GlassCard } from "@/components/ui/glass-card";
import { TextPlaceholder, ImagePlaceholder } from "@/components/ui/content-placeholder";
import { StickyCta } from "@/components/sticky-cta";
import { FaqList } from "@/components/faq-list";
import { createPublicClient } from "@/lib/supabase/public";
import { getSiteContent, getFaqs } from "@/lib/site-content";
import { sanitizeHtml } from "@/lib/sanitize";
import { formatDate, formatTime } from "@/lib/utils";

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

export const revalidate = 300;

interface EventCard {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  date: string;
  time: string;
  location: string | null;
  price: number;
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
  const today = new Date().toISOString().split("T")[0];

  const [content, faqs] = await Promise.all([getSiteContent(locale), getFaqs(locale)]);

  const [{ data: upcoming }, { data: testimonials }, { data: posts }] = await Promise.all([
    supabase
      .from("events")
      .select("id, slug, title_ro, title_en, date, time, location, price, max_participants, image_url")
      .eq("published", true)
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(3),
    supabase
      .from("testimonials")
      .select("id, content, type, rating")
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

  const events = (upcoming ?? []) as EventCard[];

  // Seat counts come from the aggregate view — the registrations table itself
  // holds personal data and is not readable without being signed in.
  const availability = new Map<string, { capacity: number | null; taken: number }>();
  if (events.length) {
    const { data: rows } = await supabase
      .from("event_availability")
      .select("event_id, capacity, taken")
      .in("event_id", events.map((e) => e.id));
    for (const row of rows ?? []) {
      availability.set(row.event_id, { capacity: row.capacity, taken: row.taken });
    }
  }

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
        <section id="events" className="bg-white/50 py-16 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="font-serif text-3xl text-charcoal md:text-4xl">
              {locale === "ro" ? "Următorul eveniment" : "Next event"}
            </h2>

            <Link
              href={`/events/${nextEvent.slug}`}
              className="mt-6 block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-deep focus-visible:ring-offset-2"
            >
              <GlassCard className="overflow-hidden transition-transform hover:scale-[1.01]">
                <div className="grid gap-6 md:grid-cols-5">
                  {nextEvent.image_url && (
                    <div className="relative aspect-video overflow-hidden rounded-2xl md:col-span-2 md:aspect-square">
                      <Image
                        src={nextEvent.image_url}
                        alt={title(nextEvent)}
                        fill
                        sizes="(max-width: 768px) 90vw, 40vw"
                        className="object-cover"
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
                        {nextEvent.price === 0 ? t("free") : `${nextEvent.price} RON`}
                      </span>
                      <SeatCount
                        locale={locale}
                        info={availability.get(nextEvent.id)}
                        fullLabel={t("full")}
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
                  <Link key={event.id} href={`/events/${event.slug}`}>
                    <GlassCard className="h-full transition-transform hover:scale-[1.02]">
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
                          {event.price === 0 ? t("free") : `${event.price} RON`}
                        </span>
                        <SeatCount
                          locale={locale}
                          info={availability.get(event.id)}
                          fullLabel={t("full")}
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
        <section id="events" className="bg-white/50 py-16 backdrop-blur-sm">
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
        <section className="bg-white/50 py-16 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center font-serif text-3xl text-charcoal md:text-4xl">
              {t("testimonials_title")}
            </h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {testimonials.map((item) => (
                <GlassCard key={item.id} className="h-full">
                  <Quote className="h-6 w-6 text-rose-deep/40" aria-hidden="true" />
                  <p className="mt-3 text-charcoal">{item.content}</p>
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
        <section className="bg-white/50 py-16 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center font-serif text-3xl text-charcoal md:text-4xl">
              {t("blog_title")}
            </h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-3">
              {posts.map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <GlassCard className="h-full transition-transform hover:scale-[1.02]">
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

      <StickyCta />
    </div>
  );
}

/** Seats remaining, or a "full" marker. Hidden entirely for uncapped events. */
function SeatCount({
  info,
  locale,
  fullLabel,
  compact = false,
}: {
  info?: { capacity: number | null; taken: number };
  locale: string;
  fullLabel: string;
  compact?: boolean;
}) {
  if (!info?.capacity) return null;

  const isFull = info.taken >= info.capacity;
  const left = Math.max(info.capacity - info.taken, 0);

  return (
    <span
      className={`flex items-center gap-1.5 text-sm ${isFull ? "text-error" : "text-charcoal-light"}`}
    >
      <Users className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
      {isFull
        ? fullLabel
        : locale === "ro"
          ? `${left} locuri libere`
          : `${left} spots left`}
    </span>
  );
}
