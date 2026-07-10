import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/utils";
import { Star } from "lucide-react";

interface Testimonial {
  id: string;
  content: string;
  type: string;
  created_at: string;
}

export default async function TestimonialsPage() {
  const locale = await getLocale();
  const t = await getTranslations("testimonials");
  const supabase = await createClient();

  const { data: testimonials } = await supabase
    .from("testimonials")
    .select("id, content, type, created_at")
    .eq("approved", true)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal">{t("title")}</h1>
      <p className="mt-2 text-charcoal-light">{t("subtitle")}</p>

      {!testimonials?.length ? (
        <p className="mt-8 text-charcoal-light">{t("no_testimonials")}</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t) => (
            <GlassCard key={t.id}>
              <div className="mb-3 flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-rose text-rose" />
                ))}
              </div>
              <p className="text-charcoal">&ldquo;{t.content}&rdquo;</p>
              <p className="mt-4 text-sm text-charcoal-light">
                {formatDate(t.created_at, locale)}
              </p>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
