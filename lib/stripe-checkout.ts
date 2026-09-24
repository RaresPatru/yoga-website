import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { siteUrl } from "@/lib/site-config";
import { toCurrency, toStripeAmount } from "@/lib/money";

/**
 * Creates the Stripe Checkout sessions for paid bookings: both the ordinary
 * booking (/api/stripe/checkout) and a waiting-list claim
 * (/api/register/claim-spot/[token]) go through here, so the price, currency
 * and return addresses are decided in exactly one place.
 */

export type CheckoutLocale = "ro" | "en";

/** The event columns a Checkout session needs. */
export interface CheckoutEvent {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  price: number;
  currency: string;
}

export interface CheckoutInput {
  event: CheckoutEvent;
  registrationId: string;
  /** Pre-fills Stripe's email field, so the receipt goes where the booking did. */
  email?: string | null;
  locale: CheckoutLocale;
}

/**
 * How long a session stays payable: 30 minutes, Stripe's minimum.
 *
 * A pending registration holds a seat until Stripe reports the session expired,
 * and the database stops counting pending rows after an hour
 * (`pending_hold_interval()`), so this must stay under that hour.
 */
export const CHECKOUT_WINDOW_SECONDS = 30 * 60;

/**
 * The address Stripe sends the visitor back to.
 *
 * It comes from configuration, never from the request: a URL built from the
 * request's `Origin` header let anyone who called the API directly choose where
 * Stripe redirected after payment (audit S4). On a Vercel preview the
 * deployment's own address is used, so a test payment returns to the preview
 * being tested rather than to production.
 */
export function checkoutBaseUrl(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return siteUrl();
}

/**
 * The parameters for one Checkout session.
 *
 * Amount and currency come from the event row the caller read from the
 * database, never from the request body. `toCurrency` narrows the column to the
 * four supported codes and `toStripeAmount` converts to the smallest unit
 * (bani, cents), so an event priced in euro is charged in euro (audit B1).
 *
 * Kept separate from the Stripe call so a test can check the parameters without
 * a Stripe account.
 */
export function checkoutSessionParams(
  { event, registrationId, email, locale }: CheckoutInput,
  now: number = Date.now()
): Stripe.Checkout.SessionCreateParams {
  const eventUrl = `${checkoutBaseUrl()}/${locale}/events/${event.slug}`;
  const name = locale === "en" && event.title_en ? event.title_en : event.title_ro;

  return {
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: toCurrency(event.currency).toLowerCase(),
          product_data: { name },
          unit_amount: toStripeAmount(event.price),
        },
        quantity: 1,
      },
    ],
    expires_at: Math.floor(now / 1000) + CHECKOUT_WINDOW_SECONDS,
    customer_email: email || undefined,
    // Stripe's own pages (card form, receipt) in the visitor's language.
    locale,
    success_url: `${eventUrl}?success=1`,
    cancel_url: `${eventUrl}?canceled=1`,
    metadata: { eventId: event.id, registrationId },
  };
}

/** Creates the session and returns the Stripe-hosted payment page's address. */
export async function createCheckoutSession(input: CheckoutInput): Promise<string> {
  const session = await getStripe().checkout.sessions.create(checkoutSessionParams(input));
  if (!session.url) throw new Error("Stripe returned a Checkout session without a URL");
  return session.url;
}
