import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { LocaleLang } from "@/components/locale-lang";
import { buildPageMetadata } from "@/lib/metadata";
import { absoluteUrl, SITE_NAME, SITE_LOCALITY, SITE_COUNTRY } from "@/lib/site-config";
import type { Metadata } from "next";

/**
 * Metadata for the home page, and the fallback for anything without its own.
 *
 * It lives on the layout rather than on app/[locale]/page.tsx because that page
 * is still a client component, and `generateMetadata` can only be exported from
 * a server component. Metadata declared on a layout applies to every page
 * beneath it and is overridden by any page that declares its own — which the
 * blog, events, testimonials and contact routes all now do. Phase 5 moves the
 * home page to the server as part of the redesign, at which point this can move
 * onto the page itself.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  return buildPageMetadata({
    title:
      locale === "ro"
        ? `${SITE_NAME} · Yoga pentru corp, minte și suflet`
        : `${SITE_NAME} · Yoga for body, mind and soul`,
    description:
      locale === "ro"
        ? "Ateliere și retreaturi de yoga în grupuri mici, ghidate cu atenție și blândețe."
        : "Yoga workshops and retreats in small groups, guided with care.",
    path: "",
    locale,
    image: absoluteUrl(`/api/og/default?locale=${locale}`),
  });
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) notFound();

  const messages = await getMessages();
  const t = await getTranslations("common");

  /**
   * schema.org LocalBusiness, on every page.
   *
   * Tells search engines this is a real business in a real place, which is what
   * connects the site to a Google Business Profile and makes it eligible for
   * local results — the "yoga in Cluj" searches that bring people who are not
   * already following her on Instagram.
   */
  const businessSchema = {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    name: SITE_NAME,
    url: absoluteUrl(`/${locale}`),
    address: {
      "@type": "PostalAddress",
      addressLocality: SITE_LOCALITY,
      addressCountry: SITE_COUNTRY,
    },
    areaServed: SITE_LOCALITY,
  };

  return (
    <NextIntlClientProvider messages={messages}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(businessSchema) }}
      />
      <LocaleLang />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-charcoal focus:shadow-lg"
      >
        {t("skip_to_content")}
      </a>
      <Header />
      <main id="main-content" tabIndex={-1} className="flex-1 pt-20">{children}</main>
      <Footer />
    </NextIntlClientProvider>
  );
}
