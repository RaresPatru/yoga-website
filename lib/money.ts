/**
 * Prices, in one place.
 *
 * "150 RON" used to be assembled inline in eight files — two page components,
 * the events list, the home page, the registration card, both share-image
 * routes and the admin list — with the currency written as a literal string in
 * every one of them. Adding a second currency meant finding all eight, and
 * missing one would show a euro price labelled RON, which is the kind of bug
 * that ends in an argument about a refund.
 */

export const CURRENCIES = ["RON", "EUR", "USD", "GBP"] as const;

export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = "RON";

/** Narrow whatever came out of the database to a currency we can render. */
export function toCurrency(value: string | null | undefined): Currency {
  return CURRENCIES.includes(value as Currency) ? (value as Currency) : DEFAULT_CURRENCY;
}

/**
 * What the admin panel's currency picker shows: the code plus its symbol, so
 * "EUR €" rather than a bare symbol nobody has to guess at.
 */
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  RON: "lei",
  EUR: "€",
  USD: "$",
  GBP: "£",
};

/**
 * A price as text.
 *
 * Romanian convention puts the amount before the currency ("150 RON") and that
 * is what the site has always shown, so `Intl.NumberFormat` is used for the
 * number — grouping separators differ between ro and en — and the code is
 * appended rather than letting `style: "currency"` decide placement and
 * symbol. Using the ISO code rather than a symbol is deliberate for a business
 * selling across borders: "£" and "$" are unambiguous, "lei" and "€" less so
 * to a visitor who arrived from an Instagram story.
 *
 * `price` is a whole number of major units — 150 means 150 RON, not 1.50.
 */
export function formatPrice(price: number, currency: string | null | undefined, locale: string) {
  const code = toCurrency(currency);
  const amount = new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "en-GB", {
    maximumFractionDigits: 0,
  }).format(price);
  return `${amount} ${code}`;
}

/**
 * The amount Stripe wants: minor units, as an integer.
 *
 * All four supported currencies are two-decimal, so this is × 100 across the
 * board. `Math.round` guards against a float creeping in — Stripe rejects a
 * non-integer `unit_amount`, and a fractional value here would mean the number
 * in the database is not the number being charged.
 */
export function toStripeAmount(price: number): number {
  return Math.round(price * 100);
}
