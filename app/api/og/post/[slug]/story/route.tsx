import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { StoryCard, STORY_SIZE } from "@/lib/og-card";
import { getSiteName } from "@/lib/site-content";
import { formatDate } from "@/lib/utils";

/** 1080x1920 Instagram-story image for a blog post. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const locale = new URL(req.url).searchParams.get("locale") === "en" ? "en" : "ro";
  /* The share card carries her business name, so it has to read the name she
     set rather than the placeholder that used to be compiled in. */
  const siteName = await getSiteName(locale);

  const supabase = createPublicClient();
  const { data: post } = await supabase
    .from("blog_posts")
    .select("title_ro, title_en, created_at")
    .eq("slug", slug)
    .eq("published", true)
    .eq("hidden", false)
    .maybeSingle();

  if (!post) {
    return new ImageResponse(<StoryCard title={siteName} siteName={siteName} />, STORY_SIZE);
  }

  const title = locale === "ro" ? post.title_ro : post.title_en || post.title_ro;

  return new ImageResponse(
    (
      <StoryCard
        eyebrow={locale === "ro" ? "Articol nou" : "New post"}
        title={title}
        subtitle={formatDate(post.created_at, locale)}
        badge={locale === "ro" ? "Citește pe site" : "Read on the site"}
        siteName={siteName}
      />
    ),
    {
      ...STORY_SIZE,
      headers: {
        "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
