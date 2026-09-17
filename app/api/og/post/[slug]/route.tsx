import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { LandscapeCard, OG_SIZE } from "@/lib/og-card";
import { getSiteName } from "@/lib/site-content";
import { toDescription } from "@/lib/metadata";
import { formatDate } from "@/lib/utils";

/** 1200x630 preview card for a blog post. */
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
    .select("title_ro, title_en, content_ro, content_en, created_at")
    .eq("slug", slug)
    .eq("published", true)
    .eq("hidden", false)
    .maybeSingle();

  if (!post) {
    return new ImageResponse(<LandscapeCard title={siteName} siteName={siteName} />, OG_SIZE);
  }

  const title = locale === "ro" ? post.title_ro : post.title_en || post.title_ro;
  const content = locale === "ro" ? post.content_ro : post.content_en || post.content_ro;

  return new ImageResponse(
    (
      <LandscapeCard
        eyebrow={formatDate(post.created_at, locale)}
        title={title}
        // The body is stored as HTML by the editor, so tags are stripped before
        // any of it is drawn onto an image.
        subtitle={toDescription(content, "")}
        siteName={siteName}
      />
    ),
    {
      ...OG_SIZE,
      headers: {
        "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
