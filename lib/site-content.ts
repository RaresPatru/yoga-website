import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { SITE_NAME } from "@/lib/site-config";

/**
 * Reads the editable page copy the instructor manages from the admin panel.
 *
 * The keys are declared here rather than scattered through the components, so
 * there is one list to check against the seeded rows in
 * supabase/migrations/20260808000001_site_content.sql. A key/value store gives
 * up compile-time safety — a typo returns nothing instead of failing — and
 * naming them in one place is what buys most of it back.
 */
export type SiteContentKey =
  | "general.site_name"
  | "home.hero_title"
  | "home.hero_subtitle"
  | "home.hero_image"
  | "home.intro"
  | "about.title"
  | "about.portrait"
  | "about.body"
  | "about.credentials"
  | "contact.instagram_url"
  | "contact.facebook_url";

export type SiteContent = Partial<Record<SiteContentKey, string>>;

/**
 * Fetches every content row and returns it keyed by name, already resolved for
 * the requested language.
 *
 * English falls back to Romanian when a translation is blank, matching how
 * events and blog posts behave — a half-translated site should show Romanian
 * rather than an empty page.
 *
 * Empty strings are dropped entirely so callers can use a plain `??` or `||`
 * check to decide between real content and a placeholder.
 *
 * Wrapped in React's `cache` so the whole table is fetched once per request no
 * matter how many components ask for it. The home page and the footer both do,
 * and the about page and the footer both do — without this, rendering either one
 * ran the same query twice.
 */
export const getSiteContent = cache(async function getSiteContent(
  locale: string
): Promise<SiteContent> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("site_content")
    .select("key, value_ro, value_en");

  if (error) {
    // Never fatal. A missing table or a network blip should degrade the page to
    // placeholders, not replace it with an error — this content is presentation,
    // not the booking flow.
    console.error("site_content fetch failed:", error.message);
    return {};
  }

  const content: SiteContent = {};
  for (const row of data ?? []) {
    const value = locale === "ro" ? row.value_ro : row.value_en || row.value_ro;
    if (value && value.trim()) {
      content[row.key as SiteContentKey] = value;
    }
  }

  return content;
});

/**
 * The name of the business, as she has set it — or the placeholder if she has
 * not yet.
 *
 * This is separated from the other keys because of where it is used. Hero copy
 * is read by one page; the name is read by the header, the footer, every page
 * title, the Open Graph card behind every shared link and the structured data a
 * search engine files the business under. Giving it a named accessor means none
 * of those has to know it lives in a key/value table, and means the fallback is
 * decided once rather than at fifteen call sites.
 *
 * `locale` is taken but barely matters: the migration leaves `value_en` null, so
 * English falls through to the Romanian value and one name serves both. It is a
 * parameter anyway so that callers which already hold a locale reuse the request
 * cache that `getSiteContent` keeps, instead of provoking a second fetch of the
 * same table for the other language.
 *
 * Never throws and never returns empty. A page that cannot reach the database
 * should still be called something.
 */
export const getSiteName = cache(async function getSiteName(
  locale: string = "ro"
): Promise<string> {
  const content = await getSiteContent(locale);
  return content["general.site_name"] ?? SITE_NAME;
});

export interface Faq {
  id: string;
  question: string;
  answer: string;
}

/** Published FAQs for a locale, in the order she arranged them. */
export async function getFaqs(locale: string): Promise<Faq[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("faqs")
    .select("id, question_ro, question_en, answer_ro, answer_en")
    .eq("published", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("faqs fetch failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    question: locale === "ro" ? row.question_ro : row.question_en || row.question_ro,
    answer: locale === "ro" ? row.answer_ro : row.answer_en || row.answer_ro,
  }));
}
