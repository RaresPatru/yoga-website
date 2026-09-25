import Image from "next/image";
import { ArrowLeft, Clock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { canOptimise } from "@/lib/image-src";
import { ShareButton } from "@/components/ui/share-button";
import { RichHtml } from "@/components/rich-html";
import { ARTICLE_TYPOGRAPHY } from "@/lib/article-typography";
import { formatPostDate } from "@/lib/blog";

export interface ArticleView {
  title: string;
  subtitle: string | null;
  picture: string | null;
  author: string | null;
  date: string;
  readingMinutes: number | null;
  /** Already through sanitizeArticleHtml. */
  html: string | null;
}

/**
 * A blog post as a reader sees it: cover, title, subtitle, a byline with the
 * author, date and reading time, the Share button, then the text.
 *
 * Drawn by the public article page and by the preview (which feeds it the
 * unpublished version), so the preview cannot drift from the real thing.
 *
 * The Share button sits under the byline, not beside the title: beside it, a
 * long title and the button fought for one line and the title ran off a
 * phone's screen (audit B24). The title also breaks long words now.
 */
export function Article({
  view,
  locale,
  labels,
}: {
  view: ArticleView;
  locale: string;
  labels: { back: string; by: (author: string) => string; readingTime: (minutes: number) => string };
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Link
        href="/blog"
        className="mb-8 inline-flex items-center gap-2 text-sm text-charcoal-light hover:text-charcoal"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {labels.back}
      </Link>

      <header>
        {view.picture && (
          <div className="relative mb-8 aspect-[3/2] overflow-hidden rounded-2xl">
            <Image
              src={view.picture}
              unoptimized={!canOptimise(view.picture)}
              alt=""
              fill
              priority
              sizes="(max-width: 768px) 100vw, 48rem"
              className="object-cover"
            />
          </div>
        )}
        <h1 className="font-serif text-3xl leading-tight text-charcoal break-words md:text-5xl md:leading-[1.1]">
          {view.title}
        </h1>
        {view.subtitle && (
          <p className="mt-4 text-lg leading-relaxed text-charcoal-light break-words md:text-xl">{view.subtitle}</p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-sage/25 py-4 text-sm text-charcoal-light">
          {view.author && <span className="font-medium text-charcoal">{labels.by(view.author)}</span>}
          <time dateTime={view.date}>{formatPostDate(view.date, locale)}</time>
          {view.readingMinutes && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-sage-deep" aria-hidden="true" />
              {labels.readingTime(view.readingMinutes)}
            </span>
          )}
          <span className="sm:ml-auto">
            <ShareButton title={view.title} />
          </span>
        </div>
      </header>

      {view.html && <RichHtml html={view.html} className={`${ARTICLE_TYPOGRAPHY} blog-content mt-10`} />}
    </article>
  );
}
