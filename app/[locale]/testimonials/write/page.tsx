import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/lib/button-styles";
import { displayNames, firstName, openInvitation } from "@/lib/reviews";
import { GlassCard } from "@/components/ui/glass-card";
import { ReviewForm } from "@/components/testimonials/review-form";
import { PageTransition } from "@/components/layout/view-transitions";

/** A page reached only through a personal link: nothing here for a search engine. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "reviews" });
  return { title: t("write_title"), robots: { index: false, follow: false } };
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

/**
 * Writing a testimonial, through the personal link emailed to someone who
 * booked (lib/reviews.ts). The token in the address is the only credential;
 * the page checks it before showing the form, greets them by first name and
 * names the event, and the server checks it again when they send.
 *
 * A link that cannot be used says why, in one of three ways, and points to the
 * page where a new one can be asked for.
 */
export default async function WriteTestimonialPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "reviews" });
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const opened = await openInvitation(token);

  if (!opened.ok) {
    const reason = opened.reason;
    return (
      <PageTransition>
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="font-serif text-3xl text-charcoal">{t(`${reason}_title`)}</h1>
          <p className="mt-3 text-charcoal-light">{t(`${reason}_body`)}</p>
          {reason !== "used" && (
            <Link href="/testimonials/share" className={`${buttonClasses({ variant: "secondary" })} mt-8`}>
              {t("ask_again")}
            </Link>
          )}
        </div>
      </PageTransition>
    );
  }

  const { invitation } = opened;
  const event = (locale === "en" && invitation.event.title_en) || invitation.event.title_ro;

  return (
    <PageTransition>
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="font-serif text-4xl text-charcoal">{t("greeting", { name: firstName(invitation.fullName) })}</h1>
        <p className="mt-3 text-charcoal-light">{t("write_intro", { event })}</p>
        <GlassCard hover={false} className="mt-8">
          <ReviewForm token={token!} locale={locale} names={displayNames(invitation.fullName)} />
        </GlassCard>
      </div>
    </PageTransition>
  );
}
