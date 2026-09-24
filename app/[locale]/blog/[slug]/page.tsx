import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";
import { GlassCard } from "@/components/ui/glass-card";
import { ShareButton } from "@/components/ui/share-button";
import { buildPageMetadata, toDescription } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/site-config";
import { getSiteContent, getSiteName } from "@/lib/site-content";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

interface PostRow {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  content_ro: string | null;
  content_en: string | null;
  created_at: string;
}

async function getPost(slug: string): Promise<PostRow | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("id, slug, title_ro, title_en, content_ro, content_en, created_at")
    .eq("slug", slug)
    .eq("published", true)
    .eq("hidden", false)
    .maybeSingle();

  return (data as PostRow) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return { title: locale === "ro" ? "Articol negăsit" : "Post not found" };
  }

  const title = locale === "ro" ? post.title_ro : post.title_en || post.title_ro;
  const content = locale === "ro" ? post.content_ro : post.content_en || post.content_ro;

  return buildPageMetadata({
    title,
    // The excerpt is derived from the post body with the HTML stripped —
    // TipTap stores markup, and raw tags in a meta description look broken in
    // search results.
    description: toDescription(content, title),
    path: `/blog/${post.slug}`,
    locale,
    image: absoluteUrl(`/api/og/post/${post.slug}?locale=${locale}`),
    type: "article",
    publishedTime: post.created_at,
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getTranslations("blog");
  const post = await getPost(slug);

  if (!post) notFound();

  const title = locale === "ro" ? post.title_ro : (post.title_en || post.title_ro);
  const content = locale === "ro" ? post.content_ro : (post.content_en || post.content_ro);

  const siteContent = await getSiteContent(locale);
  const author = siteContent["blog.default_author"] ?? siteContent["seo.person_name"];

  // schema.org Article, so search engines can show this as a proper article
  // result with an author and a date rather than a generic page.
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    datePublished: post.created_at,
    description: toDescription(content, title),
    // The author only when she has said who that is: the blog's default
    // author, else her own name ("Conținut site"). A placeholder name here
    // would be a false statement a search engine repeats (audit R6).
    ...(author ? { author: { "@type": "Person", name: author } } : {}),
    publisher: { "@type": "Organization", name: await getSiteName(locale) },
    mainEntityOfPage: absoluteUrl(`/${locale}/blog/${post.slug}`),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />

      <Link
        href="/blog"
        className="mb-8 inline-flex items-center gap-2 text-sm text-charcoal-light hover:text-charcoal"
      >
        <ArrowLeft className="h-4 w-4" /> {t("back")}
      </Link>

      <GlassCard hover={false}>
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-3xl text-charcoal md:text-4xl">{title}</h1>
          <ShareButton title={title} />
        </div>
        <p className="mt-3 text-sm text-charcoal-light">
          {formatDate(post.created_at, locale)}
        </p>

        {content && (
          <div
            className="prose prose-sage blog-content mt-8 max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
          />
        )}

      </GlassCard>
    </div>
  );
}
