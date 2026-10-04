import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { SITE_NAME } from "@/lib/site-config";
import { FIELDS, type SiteContentKey } from "@/lib/site-content-schema";

/**
 * Reads the editable page copy the instructor manages from the admin panel.
 *
 * The keys, and what each falls back to while empty, are declared in
 * lib/site-content-schema.ts. A key/value store gives up compile-time safety
 * (a typo returns nothing instead of failing), and one typed list of keys is
 * what buys most of it back.
 */
export type { SiteContentKey };

export type SiteContent = Partial<Record<SiteContentKey, string>>;

/**
 * A field's text for the page: what she wrote, or its plain fallback label
 * ("Vezi toate evenimentele"), or null when it has neither and the page
 * should show a placeholder or leave the part out.
 */
export function contentText(
  content: SiteContent,
  key: SiteContentKey,
  locale: string
): string | null {
  const value = content[key];
  if (value) return value;
  const def = FIELDS[key] as { fallback?: { ro: string; en: string } };
  return def.fallback ? def.fallback[locale === "en" ? "en" : "ro"] : null;
}

/** The dashed placeholder's name for a field, in the page's language. */
export function placeholderName(key: SiteContentKey, locale: string): string {
  const def = FIELDS[key] as { placeholder?: { ro: string; en: string }; label: { ro: string; en: string } };
  return (def.placeholder ?? def.label)[locale === "en" ? "en" : "ro"];
}

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
    // A field with one value for both languages (a name, a picture, an
    // address) keeps it in value_ro, so English falls through to it too.
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

/** A legal document's text and when she last changed it. */
export async function getLegalDocument(
  key: "legal.privacy" | "legal.terms" | "legal.cookies",
  locale: string
): Promise<{ html: string; updatedAt: string } | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("site_content")
    .select("value_ro, value_en, updated_at")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    console.error("legal document fetch failed:", error.message);
    return null;
  }
  if (!data) return null;
  const html = locale === "ro" ? data.value_ro : data.value_en || data.value_ro;
  return html?.trim() ? { html, updatedAt: data.updated_at } : null;
}

/** The six section names for the header, the phone menu and the footer. */
export function navLabels(content: SiteContent, locale: string) {
  const label = (key: SiteContentKey) => contentText(content, key, locale) ?? "";
  return {
    home: label("nav.home"),
    about: label("nav.about"),
    blog: label("nav.blog"),
    events: label("nav.events"),
    testimonials: label("nav.testimonials"),
    contact: label("nav.contact"),
  };
}

/** What the header's wordmark shows: her name, her logo, or both. */
export function brandOf(
  content: SiteContent,
  siteName: string
): { name: string; logoUrl: string | null; display: "name" | "logo" | "both" } {
  const display = content["identity.display"];
  return {
    name: siteName,
    logoUrl: content["identity.logo"] ?? null,
    display: display === "logo" || display === "both" ? display : "name",
  };
}
