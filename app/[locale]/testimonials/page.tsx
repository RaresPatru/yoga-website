import { createPublicClient } from "@/lib/supabase/public";
import { GlassCard } from "@/components/ui/glass-card";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/utils";
import { buildPageMetadata } from "@/lib/metadata";
import { absoluteUrl, SITE_NAME } from "@/lib/site-config";
import { Star, Quote } from "lucide-react";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({
    title: locale === "ro" ? `Testimoniale · ${SITE_NAME}` : `Testimonials · ${SITE_NAME}`,
    description:
      locale === "ro"
        ? "Ce spun participantele despre ateliere și retreaturi."
        : "What participants say about the workshops and retreats.",
    path: "/testimonials",
    locale,
    image: absoluteUrl(`/api/og/default?locale=${locale}`),
  });
}

interface TestimonialRow {
  id: string;
  content: string;
  type: string;
  rating: number | null;
  author_name: string | null;
  video_url: string | null;
  created_at: string;
}

/**
 * Star rating.
 *
 * Renders nothing at all when `rating` is null, which is the whole point of
 * this change: the previous version drew five filled stars above every quote
 * from a hardcoded array, on a table that had no rating column. Fabricated
 * ratings are worse than no ratings — they devalue the genuine reviews beside
 * them, and a page where everything is five stars is a page nobody believes.
 */
function Rating({ value, locale }: { value: number | null; locale: string }) {
  if (!value) return null;

  const label =
    locale === "ro" ? `${value} din 5 stele` : `${value} out of 5 stars`;

  return (
    // One accessible label for the group rather than five meaningless icons;
    // a screen reader announces "4 out of 5 stars", not "star star star star".
    <div className="flex gap-0.5" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className={
            star <= value
              ? "h-4 w-4 fill-rose-deep text-rose-deep"
              : "h-4 w-4 text-sage/40"
          }
        />
      ))}
    </div>
  );
}

export default async function TestimonialsPage() {
  const locale = await getLocale();
  const t = await getTranslations("testimonials");
  const supabase = createPublicClient();

  const { data } = await supabase
    .from("testimonials")
    .select("id, content, type, rating, author_name, video_url, created_at")
    .eq("approved", true)
    .order("created_at", { ascending: false });

  const testimonials = (data ?? []) as TestimonialRow[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal">{t("title")}</h1>
      <p className="mt-2 text-charcoal-light">{t("subtitle")}</p>

      {!testimonials.length ? (
        <p className="mt-8 text-charcoal-light">{t("no_testimonials")}</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((item) => (
            <GlassCard key={item.id} className="flex h-full flex-col">
              {/* Video testimonials previously rendered their URL as a line of
                  quoted text. They are the highest-converting form of social
                  proof for this kind of business, so they now actually play. */}
              {item.type === "video" && item.video_url ? (
                <video
                  src={item.video_url}
                  controls
                  playsInline
                  preload="metadata"
                  className="mb-4 w-full rounded-xl bg-charcoal/5"
                >
                  {locale === "ro"
                    ? "Browserul tău nu poate reda acest videoclip."
                    : "Your browser cannot play this video."}
                </video>
              ) : (
                <Quote className="mb-3 h-6 w-6 text-rose-deep/40" aria-hidden="true" />
              )}

              <Rating value={item.rating} locale={locale} />

              {item.content && (
                <p className="mt-3 flex-1 text-charcoal">{item.content}</p>
              )}

              <div className="mt-4 border-t border-sage/20 pt-3 text-sm text-charcoal-light">
                <span className="font-medium text-charcoal">
                  {item.author_name ||
                    (locale === "ro" ? "Participantă" : "Participant")}
                </span>
                <span aria-hidden="true"> · </span>
                {formatDate(item.created_at, locale)}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
