import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import { ShareButton } from "@/components/ui/share-button";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getTranslations("blog");
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .single();

  if (!post) notFound();

  const title = locale === "ro" ? post.title_ro : (post.title_en || post.title_ro);
  const content = locale === "ro" ? post.content_ro : (post.content_en || post.content_ro);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
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
            className="prose prose-sage mt-8 max-w-none"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </GlassCard>
    </div>
  );
}
