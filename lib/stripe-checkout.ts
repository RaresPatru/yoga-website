import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-config";
import { databaseTag } from "@/lib/local-database";
import { toCurrency, toStripeAmount } from "@/lib/money";
import { paymentMethodsFor } from "@/lib/payment-methods";

export { paymentMethodsFor, REVOLUT_PAY_CURRENCIES } from "@/lib/payment-methods";

/**
 * Stripe Checkout for paid bookings: what a session asks for, and opening one
 * for a booking, or sending someone back to the one they left.
 *
 * Both ways of booking a paid seat come through here, the booking form
 * (/api/register) and a waiting-list claim (/api/register/claim-spot), so the
 * price, currency, payment methods and return addresses are decided in one
 * place. What happens once a session is paid is in lib/payments.ts.
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
 * An unpaid booking holds its seat for pending_hold_interval() (an hour) from
 * the moment its checkout began, and every new session for it starts that
 * hour again (register_for_event()), so a session always closes inside its
 * hold.
 */
export const CHECKOUT_WINDOW_SECONDS = 30 * 60;

/** A session closer than this to closing is replaced rather than resumed: there would be no time to pay. */
export const RESUME_MIN_SECONDS = 5 * 60;

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
 * Payment methods are listed rather than left to Stripe's Dashboard settings:
 * a method whose money arrives days later (a bank transfer, a direct debit)
 * would leave a seat held, or released, while nobody knows yet whether it is
 * paid. Cards (with Apple Pay and Link, which Stripe shows beside them) and
 * Revolut Pay both answer at once.
 *
 * Both return addresses carry the session's id, which Stripe writes in for
 * `{CHECKOUT_SESSION_ID}`: the event page asks the server what became of that
 * session, and someone who turned back can resume it.
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
  const currency = toCurrency(event.currency);
  // What the webhook needs to find the booking, and which copy of the site
  // made the session (lib/local-database.ts). On the payment too, so her
  // Stripe Dashboard shows which booking each payment belongs to.
  const metadata = { eventId: event.id, registrationId, db: databaseTag() };

  return {
    mode: "payment",
    payment_method_types: paymentMethodsFor(currency),
    line_items: [
      {
        price_data: {
          currency: currency.toLowerCase(),
          product_data: { name },
          unit_amount: toStripeAmount(event.price),
        },
        quantity: 1,
      },
    ],
    // The codes she makes in the admin panel (Coduri de reducere).
    allow_promotion_codes: true,
    expires_at: Math.floor(now / 1000) + CHECKOUT_WINDOW_SECONDS,
    customer_email: email || undefined,
    // Stripe's own pages (card form, receipt) in the visitor's language.
    locale,
    client_reference_id: registrationId,
    success_url: `${eventUrl}?checkout={CHECKOUT_SESSION_ID}&paid=1`,
    cancel_url: `${eventUrl}?checkout={CHECKOUT_SESSION_ID}`,
    metadata,
    payment_intent_data: { description: name, metadata },
  };
}

/** Where a visitor goes next: a Stripe page to pay on, or nowhere, because it is already paid. */
export type CheckoutOpening = { url: string } | { paid: true; session: Stripe.Checkout.Session };

/** The booking's current session was replaced by another request at the same moment. */
export class CheckoutConflict extends Error {}

/** The booking no longer holds its seat, so no new session can be opened for it. */
export class HoldLapsed extends Error {}

/**
 * How long an unpaid booking holds its seat from its last checkout: the
 * database's pending_hold_interval(), which decides; tests/checkout-params
 * checks the two agree.
 */
export const PENDING_HOLD_MINUTES = 60;

export interface OpenCheckoutInput extends CheckoutInput {
  /** The session the booking had, when this person is coming back to it. */
  previousSessionId?: string | null;
}

/**
 * Sends someone to pay for a pending booking: back to the session they left,
 * when it is still open, in their language and with time on it, or to a new
 * one.
 *
 * A booking has one session that can be paid at any moment, never two. A
 * session being replaced is closed first (expired), so the old link stops
 * working before the new one exists. Two requests for the same booking at
 * once (two tabs) both create one, and only the first to be recorded stands;
 * the other is closed again. That is what used to leave a second session
 * payable after the first had released the seat (audit B11).
 *
 * A session found paid is reported as such, without a new one: the person
 * paid and came back before the webhook arrived, and lib/payments.ts records
 * the payment.
 *
 * A new session starts the seat's hold again, so the session always closes
 * before the hold does; but only while the booking still holds its seat.
 * Once the hold has lapsed the seat may be someone else's, and only
 * register_for_event(), under the lock on the event, may give it back: that
 * is HoldLapsed, and the visitor books again through the form.
 */
export async function openCheckout(input: OpenCheckoutInput): Promise<CheckoutOpening> {
  const stripe = getStripe();
  const supabase = createAdminClient();
  const previousId = input.previousSessionId ?? null;

  if (previousId) {
    const previous = await stripe.checkout.sessions.retrieve(previousId).catch((error: { code?: string }) => {
      // One Stripe no longer knows is as good as expired.
      if (error?.code === "resource_missing") return null;
      throw error;
    });
    if (previous?.status === "complete") return { paid: true, session: previous };
    if (previous?.status === "open") {
      const secondsLeft = previous.expires_at - Math.floor(Date.now() / 1000);
      if (secondsLeft > RESUME_MIN_SECONDS && previous.locale === input.locale && previous.url) {
        return { url: previous.url };
      }
      try {
        await stripe.checkout.sessions.expire(previousId);
      } catch (error) {
        // It may have been paid in the moment between: look again.
        const again = await stripe.checkout.sessions.retrieve(previousId);
        if (again.status === "complete") return { paid: true, session: again };
        if (again.status === "open") throw error;
      }
    }
  }

  const cutoff = new Date(Date.now() - PENDING_HOLD_MINUTES * 60_000).toISOString();
  const { data: held, error: holdError } = await supabase
    .from("registrations")
    .update({ checkout_started_at: new Date().toISOString() })
    .eq("id", input.registrationId)
    .eq("payment_status", "pending")
    .is("removed_at", null)
    .or(`checkout_started_at.gt."${cutoff}",and(checkout_started_at.is.null,created_at.gt."${cutoff}")`)
    .select("id");
  if (holdError) throw holdError;
  if (!held?.length) throw new HoldLapsed("The booking's hold on its seat has lapsed");

  const session = await stripe.checkout.sessions.create(checkoutSessionParams(input));
  if (!session.url) throw new Error("Stripe returned a Checkout session without a URL");

  // Recorded only if the booking still has the session this request started
  // from: the compare-and-set that lets one of two simultaneous requests win.
  const update = supabase
    .from("registrations")
    .update({ stripe_session_id: session.id })
    .eq("id", input.registrationId)
    .eq("payment_status", "pending");
  const { data: recorded, error } = await (previousId
    ? update.eq("stripe_session_id", previousId)
    : update.is("stripe_session_id", null)
  ).select("id");

  if (error || !recorded?.length) {
    // Never leave a session nobody will look for able to take money.
    await closeCheckout(session.id);
    if (error) throw error;

    // The other request won: send this one where it sent its own.
    const { data: current } = await supabase
      .from("registrations")
      .select("stripe_session_id")
      .eq("id", input.registrationId)
      .eq("payment_status", "pending")
      .maybeSingle();
    if (current?.stripe_session_id) {
      const winner = await stripe.checkout.sessions.retrieve(current.stripe_session_id);
      if (winner.status === "open" && winner.url) return { url: winner.url };
      if (winner.status === "complete") return { paid: true, session: winner };
    }
    throw new CheckoutConflict("The booking's checkout changed while this one was being opened");
  }

  return { url: session.url };
}

/**
 * Closes a session so it can no longer be paid. Best effort: one already
 * closed, expired or paid cannot be expired, and Stripe says so; a paid one
 * is then handled by lib/payments.ts like any payment without a seat.
 */
export async function closeCheckout(sessionId: string): Promise<void> {
  try {
    await getStripe().checkout.sessions.expire(sessionId);
  } catch (error) {
    console.info(`Checkout ${sessionId} was not open to close:`, (error as Error).message);
  }
}
