import Image from "next/image";
import { Clock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { canOptimise } from "@/lib/image-src";
import { GlassCard } from "@/components/ui/glass-card";
import { formatPostDate, localisePost, type CardPost } from "@/lib/blog";

/**
 * A post as a card, on the home page and on /blog: its picture, title,
 * subtitle, date and reading time. The whole card is the link, so it takes
 * the card hover (GlassCard) and nothing inside is separately clickable.
 *
 * The picture is the cover she chose or, failing that, the first picture in
 * the post (worked out by the database). With neither the card simply starts
 * with its title: no stock image stands in for one she did not choose.
 *
 * `headingLevel` keeps the page's outline honest: an h2 on /blog, under the
 * page's h1, and an h3 on the home page, under the section's h2.
 */
export function PostCard({
  post,
  locale,
  readingTime,
  headingLevel = 2,
}: {
  post: CardPost;
  locale: string;
  readingTime: (minutes: number) => string;
  headingLevel?: 2 | 3;
}) {
  const view = localisePost(post, locale);
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <Link href={`/blog/${post.slug}`} className="group block h-full rounded-2xl">
      <GlassCard className="flex h-full flex-col">
        {view.picture && (
          // Inside the card's radius rather than bleeding to its edge; the
          // event card explains why (components/events/event-feature-card.tsx).
          <div className="relative -mx-3 -mt-3 mb-5 aspect-[3/2] overflow-hidden rounded-xl">
            <Image
              src={view.picture}
              unoptimized={!canOptimise(view.picture)}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          </div>
        )}
        <Heading className="font-serif text-xl leading-snug text-charcoal break-words">{view.title}</Heading>
        {view.subtitle && (
          <p className="mt-2 text-sm leading-relaxed text-charcoal-light break-words">{view.subtitle}</p>
        )}
        <p className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-sm text-charcoal-light">
          <time dateTime={view.date}>{formatPostDate(view.date, locale)}</time>
          {view.readingMinutes && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-sage-deep" aria-hidden="true" />
              {readingTime(view.readingMinutes)}
            </span>
          )}
        </p>
      </GlassCard>
    </Link>
  );
}
