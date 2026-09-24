import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { LocaleLang } from "@/components/locale-lang";
import { buildPageMetadata } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/site-config";
import { brandOf, getSiteContent, getSiteName, navLabels } from "@/lib/site-content";
import type { Metadata } from "next";

/**
 * Metadata for the home page, and the fallback for anything without its own.
 *
 * The title is her tagline ("Conținut site" → "SEO și firmă"), to which
 * buildPageMetadata appends the site name; without a tagline it is the name
 * alone. The description is hers too, and without one there is no description
 * tag at all, which lets a search engine pick an excerpt from the page. Both
 * used to be sentences the previous AI wrote on her behalf.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const content = await getSiteContent(locale);

  return buildPageMetadata({
    title: content["seo.tagline"] ?? "",
    description: content["seo.description"],
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

  /*
   * Every namespace except the admin panel's. Its copy lives in the same files
   * but is read by components/admin/locale-provider.tsx, never through this
   * provider — and whatever is handed to the provider is shipped to every
   * visitor's browser. That was 3.4 KB gzipped on 23 September 2026, on every
   * page, to people mostly on phones.
   */
  const messages = Object.fromEntries(
    Object.entries(await getMessages()).filter(([namespace]) => namespace !== "admin")
  );
  const t = await getTranslations("common");
  /* One read, shared by the structured data below and by the header. The header
     is a client component and cannot reach the database itself, so the name has
     to arrive as a prop from here. */
  const siteName = await getSiteName(locale);
  const content = await getSiteContent(locale);

  /**
   * schema.org data about the business, on every page.
   *
   * Only what she has said. The name and address of the site always; the
   * area she serves and her own name only when she has filled them in under
   * "SEO și firmă". It used to state Cluj-Napoca as the business's town and
   * address, which was a placeholder: she hosts events anywhere in Romania,
   * and a wrong locality in structured data is a false statement a search
   * engine will repeat (audit R6).
   */
  const businessSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: absoluteUrl(`/${locale}`),
    ...(content["identity.logo"] ? { logo: content["identity.logo"] } : {}),
    ...(content["seo.description"] ? { description: content["seo.description"] } : {}),
    ...(content["seo.area_served"] ? { areaServed: content["seo.area_served"] } : {}),
    ...(content["seo.person_name"]
      ? { founder: { "@type": "Person", name: content["seo.person_name"] } }
      : {}),
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
      <Header brand={brandOf(content, siteName)} labels={navLabels(content, locale)} />
      <main id="main-content" tabIndex={-1} className="flex-1 pt-20">{children}</main>
      <Footer locale={locale} />
    </NextIntlClientProvider>
  );
}
