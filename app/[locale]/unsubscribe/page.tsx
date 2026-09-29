import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/lib/button-styles";
import { getSiteName } from "@/lib/site-content";
import { GlassCard } from "@/components/ui/glass-card";
import { PageTransition } from "@/components/layout/view-transitions";

/** Reached only from an email: nothing here for a search engine. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "unsubscribe" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[]; done?: string; invalid?: string }>;
};

/**
 * Where the "Dezabonează-te" link in an announcement's footer leads. Opening
 * the page changes nothing: the one button does, as a plain form post to
 * /api/unsubscribe, which answers with this page again, saying it is done.
 * Mail scanners open every link in an email to check it, so a link that
 * unsubscribed on its own would unsubscribe people who never asked.
 *
 * The form needs no JavaScript, so it works the moment the page shows, even
 * in an in-app browser that is slow to load the rest.
 */
export default async function UnsubscribePage({ params, searchParams }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "unsubscribe" });
  const query = await searchParams;
  const token = Array.isArray(query.token) ? query.token[0] : query.token;
  const siteName = await getSiteName(locale);

  const state = query.done ? "done" : query.invalid || !token ? "invalid" : "ask";

  return (
    <PageTransition>
      <div className="mx-auto max-w-xl px-4 py-16">
        <GlassCard hover={false}>
          {state === "ask" && (
            <>
              <h1 className="font-serif text-3xl text-charcoal">{t("title")}</h1>
              <p className="mt-3 text-charcoal-light">{t("ask", { site: siteName })}</p>
              <p className="mt-2 text-sm text-charcoal-light">{t("still_bookings")}</p>
              <form method="post" action="/api/unsubscribe" className="mt-6">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="locale" value={locale === "en" ? "en" : "ro"} />
                <input type="hidden" name="from" value="page" />
                <button type="submit" className={buttonClasses()}>
                  {t("button")}
                </button>
              </form>
            </>
          )}
          {state === "done" && (
            <>
              <h1 className="font-serif text-3xl text-charcoal">{t("done_title")}</h1>
              <p className="mt-3 text-charcoal-light" role="status">
                {t("done", { site: siteName })}
              </p>
              <p className="mt-2 text-sm text-charcoal-light">{t("changed_mind")}</p>
              <Link href="/" className={buttonClasses({ variant: "secondary", className: "mt-6" })}>
                {t("home")}
              </Link>
            </>
          )}
          {state === "invalid" && (
            <>
              <h1 className="font-serif text-3xl text-charcoal">{t("invalid_title")}</h1>
              <p className="mt-3 text-charcoal-light">{t("invalid")}</p>
              <Link href="/contact" className={buttonClasses({ variant: "secondary", className: "mt-6" })}>
                {t("contact")}
              </Link>
            </>
          )}
        </GlassCard>
      </div>
    </PageTransition>
  );
}
