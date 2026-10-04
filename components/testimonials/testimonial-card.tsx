import Image from "next/image";
import { BadgeCheck, Quote } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Rating } from "@/components/ui/rating";
import { RichHtml } from "@/components/rich-html";
import { reviewHtml, sanitizeArticleHtml } from "@/lib/sanitize";
import { embedFromUrl } from "@/lib/embeds";
import { canOptimise } from "@/lib/image-src";
import { formatDate } from "@/lib/utils";

/**
 * The columns a public page reads for a testimonial: the ones visitors are
 * granted (20260929000000_reviews.sql), and the event it is about while that
 * event is still published. One literal, for Supabase's type inference.
 */
export const PUBLIC_TESTIMONIAL_COLUMNS =
  "id, content, rating, author_name, video_url, photo_url, source, created_at, event_title_ro, event_title_en, event_date, events(slug, title_ro, title_en, date)";

export interface PublicTestimonial {
  id: string;
  content: string;
  rating: number | null;
  author_name: string | null;
  video_url: string | null;
  photo_url: string | null;
  source: string;
  created_at: string;
  event_title_ro: string | null;
  event_title_en: string | null;
  event_date: string | null;
  events: { slug: string; title_ro: string; title_en: string | null; date: string } | null;
}

/** Text safe inside a double-quoted HTML attribute. */
function attribute(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * One testimonial, as every public page draws it: the home page's selection,
 * /testimonials, and a past event's page (which leaves out the event).
 *
 *   - The photo, if they added one, above the words.
 *   - Their words, through the strict sanitizer again, whatever is stored.
 *   - A video only when pressed: the same placeholder the blog uses, so the
 *     player's company hears nothing until the visitor asks (docs/PRIVACY.md).
 *   - "Participare verificată" for one written through a personal link, which
 *     /testimonials explains; the older, imported ones make no such claim.
 *   - The event it is about, linked while the event is published, or by the
 *     title it had when it was deleted.
 *
 * Not a link, so it does not lift: the lift means "this opens" everywhere
 * else on the site.
 */
export async function TestimonialCard({
  item,
  locale,
  showEvent = true,
  className,
}: {
  item: PublicTestimonial;
  locale: string;
  showEvent?: boolean;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: "testimonials" });
  const te = await getTranslations({ locale, namespace: "embed" });
  const en = locale === "en";
  const name = item.author_name || (en ? "Participant" : "Participantă");

  const event = item.events
    ? { title: (en && item.events.title_en) || item.events.title_ro, slug: item.events.slug as string | null }
    : item.event_title_ro
      ? { title: (en && item.event_title_en) || item.event_title_ro, slug: null }
      : null;

  const embed = item.video_url ? embedFromUrl(item.video_url) : null;
  const video =
    embed && !("refused" in embed)
      ? sanitizeArticleHtml(
          `<iframe src="${embed.src}" data-aspect="${embed.aspect}" title="${attribute(te("title", { name }))}"></iframe>`,
          { play: te("play", { provider: "{provider}" }), note: te("note", { provider: "{provider}" }) }
        )
      : null;

  return (
    <article className={`h-full ${className ?? ""}`}>
      <GlassCard hover={false} className="flex h-full flex-col">
        {item.photo_url ? (
          <div className="relative -mx-2 -mt-2 mb-4 aspect-[4/3] overflow-hidden rounded-xl bg-sage/10">
            <Image
              src={item.photo_url}
              unoptimized={!canOptimise(item.photo_url)}
              alt={t("photo_alt", { name })}
              fill
              sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 90vw"
              className="object-cover"
            />
          </div>
        ) : (
          <Quote className="mb-3 h-6 w-6 text-rose-deep/40" aria-hidden="true" />
        )}

        <Rating value={item.rating} locale={locale} />

        <div
          className="mt-3 flex-1 break-words text-charcoal [&_p+p]:mt-3"
          dangerouslySetInnerHTML={{ __html: reviewHtml(item.content) }}
        />

        {video && <RichHtml html={video} className="mt-4" />}

        <div className="mt-4 space-y-1 border-t border-sage/20 pt-3 text-sm text-charcoal-light">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-charcoal">{name}</span>
            {item.source === "participant" && (
              <span className="inline-flex items-center gap-1 text-xs text-sage-deep">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t("verified")}
              </span>
            )}
          </p>
          {showEvent && event && (
            <p>
              {event.slug ? (
                <Link href={`/events/${event.slug}`} className="underline decoration-sage/50 underline-offset-2 hover:text-rose-deep">
                  {t("about_event", { event: event.title })}
                </Link>
              ) : (
                t("about_event", { event: event.title })
              )}
            </p>
          )}
          <p>{formatDate(item.created_at, locale)}</p>
        </div>
      </GlassCard>
    </article>
  );
}
