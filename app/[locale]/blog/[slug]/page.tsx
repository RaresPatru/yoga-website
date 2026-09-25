import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { getLocale, getTranslations } from "next-intl/server";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { buildPageMetadata, toDescription } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/site-config";
import { getSiteContent, getSiteName } from "@/lib/site-content";
import { localisePost } from "@/lib/blog";
import { Article } from "@/components/blog/article";
import type { Metadata } from "next";

async function getPost(slug: string) {
  const { data } = await createPublicClient()
    .from("blog_posts")
    .select(
      "id, slug, title_ro, title_en, subtitle_ro, subtitle_en, content_ro, content_en, cover_url, first_image, author, published_at, created_at, updated_at, reading_minutes_ro, reading_minutes_en"
    )
    .eq("slug", slug)
    .eq("published", true)
    .eq("hidden", false)
    .maybeSingle();
  return data;
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

  const view = localisePost(post, locale);

  return buildPageMetadata({
    title: view.title,
    // The subtitle when she wrote one, since it is her own summary; otherwise
    // the start of the text with the HTML stripped.
    description: view.subtitle ?? toDescription(view.content, view.title),
    path: `/blog/${post.slug}`,
    locale,
    image: absoluteUrl(`/api/og/post/${post.slug}?locale=${locale}`),
    type: "article",
    publishedTime: view.date,
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
  const te = await getTranslations("embed");
  const post = await getPost(slug);

  if (!post) notFound();

  const view = localisePost(post, locale);
  const siteContent = await getSiteContent(locale);
  // Her own byline for this post, else the blog's default author, else her
  // name from Conținut site, else none: a placeholder name would be a false
  // statement a search engine repeats (audit R6).
  const author =
    post.author?.trim() || siteContent["blog.default_author"] || siteContent["seo.person_name"] || null;

  // schema.org Article, so search engines can show this as a proper article
  // result with an author and a date rather than a generic page.
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: view.title,
    datePublished: view.date,
    dateModified: post.updated_at,
    description: view.subtitle ?? toDescription(view.content, view.title),
    ...(view.picture ? { image: /^https?:/.test(view.picture) ? view.picture : absoluteUrl(view.picture) } : {}),
    ...(author ? { author: { "@type": "Person", name: author } } : {}),
    publisher: { "@type": "Organization", name: await getSiteName(locale) },
    mainEntityOfPage: absoluteUrl(`/${locale}/blog/${post.slug}`),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <Article
        locale={locale}
        view={{
          ...view,
          author,
          html: view.content
            ? sanitizeArticleHtml(view.content, {
                // The placeholder stays in, for sanitizeArticleHtml to fill per video.
                play: te("play", { provider: "{provider}" }),
                note: te("note", { provider: "{provider}" }),
              })
            : null,
        }}
        labels={{
          back: t("back"),
          by: (name) => t("by", { author: name }),
          readingTime: (minutes) => t("reading_time", { minutes }),
        }}
      />
    </>
  );
}
