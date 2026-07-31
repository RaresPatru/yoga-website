import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { LocaleLang } from "@/components/locale-lang";

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

  return (
    <NextIntlClientProvider messages={messages}>
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
