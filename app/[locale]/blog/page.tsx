import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { formatDate } from "@/lib/utils";
import { getLocale, getTranslations } from "next-intl/server";

interface Post {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  content_ro: string | null;
  created_at: string;
}

export default async function BlogPage() {
  const locale = await getLocale();
  const t = await getTranslations("blog");
  const supabase = await createClient();

  const { data: posts } = await supabase
    .from("blog_posts")
    .select("id, slug, title_ro, title_en, content_ro, created_at")
    .eq("published", true)
    .eq("hidden", false)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal">{t("title")}</h1>

      {!posts?.length ? (
        <p className="mt-4 text-charcoal-light">{t("no_posts")}</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`}>
              <GlassCard className="h-full transition-transform hover:scale-[1.02]">
                <h2 className="font-serif text-xl text-charcoal">
                  {locale === "ro" ? post.title_ro : (post.title_en || post.title_ro)}
                </h2>
                <p className="mt-2 text-sm text-charcoal-light">
                  {formatDate(post.created_at, locale)}
                </p>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
