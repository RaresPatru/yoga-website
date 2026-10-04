import type Stripe from "stripe";
import type { Currency } from "@/lib/money";

/**
 * Which payment methods a price can be paid with: the checkout asks Stripe
 * for them (lib/stripe-checkout.ts), and the event page says them under the
 * price. Kept apart from the checkout, which is server only, so the page can
 * read it too.
 *
 * The currencies Revolut Pay takes from a business in Romania. Stripe lists
 * EUR, RON, HUF, PLN and DKK for an account in the EU, and GBP only for one
 * in the UK; of the four the site prices in, that leaves two. Asked for in
 * USD or GBP, Stripe quietly drops it and shows cards alone (checked against
 * the sandbox, 3 October 2026), but the parameters say what is meant.
 */
export const REVOLUT_PAY_CURRENCIES: readonly Currency[] = ["RON", "EUR"];

/** The payment methods offered for a price in this currency. */
export function paymentMethodsFor(currency: Currency): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
  return REVOLUT_PAY_CURRENCIES.includes(currency) ? ["card", "revolut_pay"] : ["card"];
}
