import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/site-config";
import { GlassCard } from "@/components/ui/glass-card";
import { ShareForm } from "@/components/testimonials/share-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "reviews" });
  return buildPageMetadata({
    title: t("share_title"),
    description: t("share_intro"),
    path: "/testimonials/share",
    locale,
    image: absoluteUrl(`/api/og/default?locale=${locale}`),
  });
}

/**
 * Where a participant asks for their link to write a testimonial: the home
 * page's and /testimonials' "Împărtășește-ți experiența" lead here. The link
 * goes to the email they booked with, and only there, which is what makes
 * what they write a verified testimonial.
 */
export default async function ShareExperiencePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "reviews" });

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal">{t("share_title")}</h1>
      <p className="mt-3 text-charcoal-light">{t("share_intro")}</p>
      <GlassCard hover={false} className="mt-8">
        <ShareForm locale={locale} />
      </GlassCard>
      <p className="mt-6 text-sm text-charcoal-light">{t("how_we_check")}</p>
    </div>
  );
}
