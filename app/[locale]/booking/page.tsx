import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/lib/button-styles";
import { formatEventSchedule } from "@/lib/utils";
import { formatPaid, formatPrice } from "@/lib/money";
import { emailMoment } from "@/lib/email-content";
import { refundDeadline } from "@/lib/cancel-rules";
import { bookingByLink, isActive, optionFor } from "@/lib/cancel-booking";
import { GlassCard } from "@/components/ui/glass-card";
import { PageTransition } from "@/components/layout/view-transitions";

/** Reached only from a confirmation email: nothing here for a search engine. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "manage" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[]; result?: string | string[] }>;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** What the line after pressing Cancel says, by the outcome /api/booking/cancel sent back. */
const DONE: Record<string, string> = {
  cancelled: "done_cancelled",
  refunded: "done_refunded",
  requested: "done_requested",
  refund_failed: "done_refund_failed",
  error: "done_error",
  busy: "done_error",
};

/**
 * Where the cancel link in a confirmation email leads: the booking, what
 * cancelling it now would do with the money, and one button that says so
 * (lib/cancel-rules.ts has the rules: an automatic full refund up to 48 hours
 * before the start, after that her decision, and a free booking simply
 * cancels).
 *
 * Opening the page changes nothing: the button does, as a plain form post to
 * /api/booking/cancel, which answers with this page again. Mail scanners open
 * every link in an email, so a link that cancelled on its own would cancel
 * bookings nobody meant to. The form needs no JavaScript, so it works the
 * moment the page shows, even in an in-app browser slow to load the rest.
 *
 * The token is the key, and the page shows nothing of the booking a stranger
 * could not already read in that person's email.
 */
export default async function BookingPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const lang = locale === "en" ? "en" : "ro";
  const t = await getTranslations({ locale, namespace: "manage" });
  const query = await searchParams;
  const token = first(query.token) ?? "";
  const result = first(query.result);
  const booking = await bookingByLink(token).catch((error) => {
    console.error("Could not read a booking from its link:", error);
    return null;
  });

  const contact = (
    <Link href="/contact" className={buttonClasses({ variant: "secondary", className: "mt-6" })}>
      {t("contact")}
    </Link>
  );

  if (!booking) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-xl px-4 py-16">
          <GlassCard hover={false}>
            <h1 className="font-serif text-3xl text-charcoal">{t("invalid_title")}</h1>
            <p className="mt-3 text-charcoal-light">{t("invalid")}</p>
            {contact}
          </GlassCard>
        </div>
      </PageTransition>
    );
  }

  const { event } = booking;
  const title = (lang === "en" && event.titleEn?.trim()) || event.titleRo;
  const schedule = formatEventSchedule(
    { date: event.date, time: event.time, end_date: event.endDate, end_time: event.endTime },
    lang
  );
  const paid = booking.paymentStatus === "completed" || booking.paymentStatus === "refunded";
  const amount =
    booking.amountPaid !== null
      ? formatPaid(booking.amountPaid, booking.paidCurrency, lang)
      : formatPrice(event.price, event.currency, lang);
  const active = isActive(booking);
  const option = optionFor(booking);
  const done = result && DONE[result];

  return (
    <PageTransition>
      <div className="mx-auto max-w-xl px-4 py-16">
        <GlassCard hover={false}>
          <h1 className="font-serif text-3xl text-charcoal">{t("title")}</h1>
          <p className="mt-4 break-words font-serif text-2xl leading-snug text-charcoal">
            <Link href={`/events/${event.slug}`} className="hover:text-rose-deep">
              {title}
            </Link>
          </p>

          <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-charcoal-light">{t("when")}</dt>
            <dd className="text-charcoal">{schedule.time ? `${schedule.date}, ${schedule.time}` : schedule.date}</dd>
            <dt className="text-charcoal-light">{t("for")}</dt>
            <dd className="break-words text-charcoal">{booking.fullName}</dd>
            {paid && (
              <>
                <dt className="text-charcoal-light">{t("paid")}</dt>
                <dd className="text-charcoal">{amount}</dd>
              </>
            )}
          </dl>

          {done && (
            <p
              role={result === "error" || result === "busy" ? "alert" : "status"}
              className={
                result === "error" || result === "busy"
                  ? "mt-6 rounded-xl bg-error/10 px-4 py-3 text-sm text-charcoal"
                  : "mt-6 rounded-xl bg-success/10 px-4 py-3 text-sm text-charcoal"
              }
            >
              {t(done)}
            </p>
          )}

          {active && option === "closed" && (
            <>
              <p className="mt-6 text-charcoal-light">{t("closed")}</p>
              {contact}
            </>
          )}

          {active && option !== "closed" && (
            <form method="post" action="/api/booking/cancel" className="mt-6">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="locale" value={lang} />
              {option === "refund" && (
                <>
                  <p className="text-charcoal">{t("refund_intro", { amount })}</p>
                  <p className="mt-2 text-sm text-charcoal-light">
                    {t("refund_until", { date: emailMoment(refundDeadline(event.startsAt), lang) })}
                  </p>
                </>
              )}
              {option === "request" && (
                <>
                  <p className="text-charcoal">{t("request_intro")}</p>
                  <p className="mt-2 text-sm text-charcoal-light">{t("request_transfer")}</p>
                </>
              )}
              {option === "free" && <p className="text-charcoal">{t("free_intro")}</p>}
              <button type="submit" className={buttonClasses({ className: "mt-6 w-full sm:w-auto" })}>
                {t(option === "refund" ? "refund_button" : option === "request" ? "request_button" : "free_button")}
              </button>
            </form>
          )}

          {!active && (
            <div className="mt-6 space-y-2 text-charcoal-light">
              {booking.removedAt ? (
                <p>{t("state_removed")}</p>
              ) : booking.cancelledAt ? (
                <p>{t("state_cancelled", { date: emailMoment(new Date(booking.cancelledAt), lang) })}</p>
              ) : null}
              {booking.paymentStatus === "refunded" ? (
                <p>{booking.amountPaid !== null ? t("state_refunded", { amount }) : t("state_refunded_plain")}</p>
              ) : booking.refundRequestedAt ? (
                <p>{t("state_requested")}</p>
              ) : null}
            </div>
          )}

          {(!active || option === "closed") && !done && (
            <Link href={`/events/${event.slug}`} className="mt-6 inline-block text-sm text-sage-deep underline underline-offset-2 hover:text-rose-deep">
              {t("event_page")}
            </Link>
          )}
        </GlassCard>
      </div>
    </PageTransition>
  );
}
