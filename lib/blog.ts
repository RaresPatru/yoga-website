/**
 * What the public blog pages share: how many cards a page holds, which
 * columns a card needs, and how a post's language, picture and date are
 * chosen. Also used by the preview page, which draws the same article from
 * unpublished data.
 */

/** Twelve fills one, two or three columns evenly. */
export const POSTS_PER_PAGE = 12;

/** One literal, never built from pieces (CLAUDE.md: Supabase's type inference). */
export const CARD_COLUMNS =
  "id, slug, title_ro, title_en, subtitle_ro, subtitle_en, cover_url, first_image, published_at, created_at, reading_minutes_ro, reading_minutes_en" as const;

export interface CardPost {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  subtitle_ro: string | null;
  subtitle_en: string | null;
  cover_url: string | null;
  first_image: string | null;
  published_at: string | null;
  created_at: string;
  reading_minutes_ro: number | null;
  reading_minutes_en: number | null;
}

/**
 * A post in the reader's language. English falls back to Romanian field by
 * field, as everywhere on the site: an untranslated subtitle shows the
 * Romanian one rather than nothing. Reading time follows the text actually
 * shown.
 */
export function localisePost<T extends CardPost & { content_ro?: string | null; content_en?: string | null }>(
  post: T,
  locale: string
) {
  const en = locale === "en";
  const englishText = en && Boolean(post.content_en?.trim());
  return {
    title: (en && post.title_en?.trim()) || post.title_ro,
    subtitle: (en && post.subtitle_en?.trim()) || post.subtitle_ro?.trim() || null,
    content: englishText ? post.content_en! : (post.content_ro ?? null),
    readingMinutes: (en && post.reading_minutes_en) || post.reading_minutes_ro,
    picture: post.cover_url || post.first_image || null,
    date: post.published_at ?? post.created_at,
  };
}

/** "25 septembrie 2026", on the calendar of the place she works. */
export function formatPostDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Bucharest",
  }).format(new Date(date));
}

/** A page number from the address: 1 for anything that is not a whole number above zero. */
export function pageFrom(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
