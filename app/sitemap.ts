import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { absoluteUrl } from "@/lib/site-config";
import { routing } from "@/i18n/routing";

/**
 * Generated sitemap, served at /sitemap.xml.
 *
 * A sitemap is a list of every page worth indexing, with a hint about how
 * recently each changed. Search engines find pages by following links, so a
 * brand-new event that has only been shared to an Instagram story — never
 * linked from anywhere Google can crawl — might otherwise take weeks to be
 * discovered, or never be. Listing it explicitly closes that gap.
 *
 * Built from the database rather than hand-maintained, so publishing an event
 * in the admin panel is all it takes for it to appear here.
 *
 * Each entry carries `alternates.languages` so the Romanian and English
 * versions are understood as translations of one page rather than as two pages
 * competing for the same search results.
 */

/** Adds the ro/en alternates for a path, in the shape Next expects. */
function withLanguages(path: string) {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = absoluteUrl(`/${locale}${path}`);
  }
  return languages;
}

/**
 * Rebuilt on every request rather than baked in at build time.
 *
 * By default Next.js prerenders this once during the build, which would freeze
 * the list at whatever existed when the site was last deployed. The instructor
 * publishes events from the admin panel without redeploying, so a static
 * sitemap would never mention any of them — precisely the pages that most need
 * discovering. Sitemaps are fetched rarely, so the cost is one query per crawl.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient();

  // Row Level Security means only published, non-hidden rows come back — so a
  // draft cannot accidentally be advertised to Google.
  const [{ data: events }, { data: posts }] = await Promise.all([
    supabase.from("events").select("slug, date, updated_at").eq("published", true),
    supabase
      .from("blog_posts")
      .select("slug, updated_at, created_at")
      .eq("published", true)
      .eq("hidden", false),
  ]);

  const staticPaths: Array<{ path: string; priority: number }> = [
    { path: "", priority: 1 },
    { path: "/events", priority: 0.9 },
    // High priority deliberately: for a solo instructor this is the page that
    // does the convincing, and it was missing from this list entirely.
    { path: "/about", priority: 0.8 },
    { path: "/blog", priority: 0.7 },
    { path: "/testimonials", priority: 0.6 },
    { path: "/contact", priority: 0.5 },
  ];

  const entries: MetadataRoute.Sitemap = staticPaths.map(({ path, priority }) => ({
    url: absoluteUrl(`/${routing.defaultLocale}${path}`),
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority,
    alternates: { languages: withLanguages(path) },
  }));

  for (const event of events ?? []) {
    entries.push({
      url: absoluteUrl(`/${routing.defaultLocale}/events/${event.slug}`),
      lastModified: new Date(event.updated_at ?? event.date),
      // Events change more often than posts: seats fill, details get adjusted.
      changeFrequency: "daily",
      priority: 0.8,
      alternates: { languages: withLanguages(`/events/${event.slug}`) },
    });
  }

  for (const post of posts ?? []) {
    entries.push({
      url: absoluteUrl(`/${routing.defaultLocale}/blog/${post.slug}`),
      lastModified: new Date(post.updated_at ?? post.created_at),
      changeFrequency: "monthly",
      priority: 0.6,
      alternates: { languages: withLanguages(`/blog/${post.slug}`) },
    });
  }

  return entries;
}
