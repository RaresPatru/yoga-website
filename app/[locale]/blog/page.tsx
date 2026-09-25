import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { getLocale, getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/site-config";
import { CARD_COLUMNS, POSTS_PER_PAGE, pageFrom } from "@/lib/blog";
import { PostCard } from "@/components/blog/post-card";
import { Pagination } from "@/components/ui/pagination";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const page = pageFrom((await searchParams).page);
  const t = await getTranslations({ locale, namespace: "blog" });
  return buildPageMetadata({
    title: page > 1 ? t("page_title", { page }) : t("title"),
    // Each page is its own address, so each is its own canonical URL: page 2
    // is not a copy of page 1.
    path: page > 1 ? `/blog?page=${page}` : "/blog",
    locale,
    image: absoluteUrl(`/api/og/default?locale=${locale}`),
  });
}

export default async function BlogPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations("blog");
  const tp = await getTranslations("pagination");
  const page = pageFrom((await searchParams).page);
  const from = (page - 1) * POSTS_PER_PAGE;

  const { data: posts, count } = await createPublicClient()
    .from("blog_posts")
    .select(CARD_COLUMNS, { count: "exact" })
    .eq("published", true)
    .eq("hidden", false)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, from + POSTS_PER_PAGE - 1);

  const pageCount = Math.max(1, Math.ceil((count ?? 0) / POSTS_PER_PAGE));
  // A page past the end is a missing page, not an empty one.
  if (page > pageCount) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal">{t("title")}</h1>

      {!posts?.length ? (
        <p className="mt-4 text-charcoal-light">{t("no_posts")}</p>
      ) : (
        <>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <li key={post.id} className="min-w-0">
                <PostCard
                  post={post}
                  locale={locale}
                  readingTime={(minutes) => t("reading_time", { minutes })}
                />
              </li>
            ))}
          </ul>
          <Pagination
            className="mt-12"
            page={page}
            pageCount={pageCount}
            href={(p) => (p === 1 ? `/${locale}/blog` : `/${locale}/blog?page=${p}`)}
            labels={{
              label: tp("label"),
              previous: tp("previous"),
              next: tp("next"),
              page: (p) => tp("page", { page: p }),
            }}
          />
        </>
      )}
    </div>
  );
}
