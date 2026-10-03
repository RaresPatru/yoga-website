import { test, expect } from "@playwright/test";
import {
  checkoutSessionParams,
  CHECKOUT_WINDOW_SECONDS,
  PENDING_HOLD_MINUTES,
  REVOLUT_PAY_CURRENCIES,
} from "../lib/stripe-checkout";
import { siteUrl } from "../lib/site-config";
import { databaseTag } from "../lib/local-database";
import { AUTOMATIC_REFUND_HOURS, cancelOption, refundDeadline } from "../lib/cancel-rules";
import { formatPaid } from "../lib/money";
import { pendingHoldMinutes } from "./helpers";

/**
 * The parameters every Stripe Checkout session is built from, checked without
 * a Stripe account. Both paid booking paths (a normal booking and a
 * waiting-list claim) build their sessions with checkoutSessionParams, so these
 * tests cover both. The cancel rules are here too: plain functions, read by the
 * cancel page, the server and the confirmation email alike.
 */

const event = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "retreat-de-toamna",
  title_ro: "Retreat de toamnă",
  title_en: "Autumn retreat",
  price: 80,
  currency: "EUR",
};

test("charges in the event's own currency, in the smallest unit (B1)", () => {
  const params = checkoutSessionParams({ event, registrationId: "r1", locale: "ro" });
  const price = params.line_items![0].price_data!;
  expect(price.currency).toBe("eur");
  expect(price.unit_amount).toBe(8000);

  const inLei = checkoutSessionParams({
    event: { ...event, currency: "RON", price: 150 },
    registrationId: "r1",
    locale: "ro",
  });
  expect(inLei.line_items![0].price_data!.currency).toBe("ron");
  expect(inLei.line_items![0].price_data!.unit_amount).toBe(15000);
});

test("both return addresses come from the site's own URL and carry the session (S4, B2)", () => {
  const params = checkoutSessionParams({ event, registrationId: "r1", locale: "en" });
  const base = siteUrl();
  // Stripe writes the session's id in for {CHECKOUT_SESSION_ID}, on the way
  // back from paying and on the way back from turning back (checked against
  // the sandbox, 3 October 2026).
  expect(params.success_url).toBe(`${base}/en/events/${event.slug}?checkout={CHECKOUT_SESSION_ID}&paid=1`);
  expect(params.cancel_url).toBe(`${base}/en/events/${event.slug}?checkout={CHECKOUT_SESSION_ID}`);
});

test("speaks the visitor's language and pre-fills their email", () => {
  const params = checkoutSessionParams({
    event,
    registrationId: "r1",
    email: "ana@example.com",
    locale: "en",
  });
  expect(params.locale).toBe("en");
  expect(params.customer_email).toBe("ana@example.com");
  expect(params.line_items![0].price_data!.product_data!.name).toBe("Autumn retreat");

  const romanian = checkoutSessionParams({ event, registrationId: "r1", locale: "ro" });
  expect(romanian.locale).toBe("ro");
  expect(romanian.line_items![0].price_data!.product_data!.name).toBe("Retreat de toamnă");
});

test("carries the ids the webhook needs, on the session and the payment, with its database", () => {
  const now = Date.UTC(2026, 8, 24, 12, 0, 0);
  const params = checkoutSessionParams({ event, registrationId: "r42", locale: "ro" }, now);
  const metadata = { eventId: event.id, registrationId: "r42", db: databaseTag() };
  expect(params.metadata).toEqual(metadata);
  expect(params.payment_intent_data?.metadata).toEqual(metadata);
  expect(params.client_reference_id).toBe("r42");
  expect(params.expires_at).toBe(now / 1000 + CHECKOUT_WINDOW_SECONDS);
  // The suite runs against the local database, so its sessions say so, and
  // production's webhook leaves them alone.
  expect(databaseTag()).toBe("local");
});

test("a session closes inside its seat's hold, and the code agrees with the database on the hold", async () => {
  expect(CHECKOUT_WINDOW_SECONDS).toBeLessThan(PENDING_HOLD_MINUTES * 60);
  expect(await pendingHoldMinutes()).toBe(PENDING_HOLD_MINUTES);
});

test("offers Revolut Pay for lei and euro, cards for everything, and immediate methods only", () => {
  for (const currency of ["RON", "EUR"]) {
    const params = checkoutSessionParams({ event: { ...event, currency }, registrationId: "r1", locale: "ro" });
    expect(params.payment_method_types).toEqual(["card", "revolut_pay"]);
  }
  for (const currency of ["USD", "GBP"]) {
    const params = checkoutSessionParams({ event: { ...event, currency }, registrationId: "r1", locale: "ro" });
    expect(params.payment_method_types, `Revolut Pay takes no ${currency} from an account in Romania`).toEqual(["card"]);
  }
  expect([...REVOLUT_PAY_CURRENCIES].sort()).toEqual(["EUR", "RON"]);
});

test("takes promotion codes", () => {
  const params = checkoutSessionParams({ event, registrationId: "r1", locale: "ro" });
  expect(params.allow_promotion_codes).toBe(true);
});

test.describe("what cancelling does with the money", () => {
  const startsAt = "2026-11-20T08:00:00.000Z";
  const start = Date.parse(startsAt);
  const hour = 3_600_000;
  const paid = { payment_status: "completed", amount_paid: 45000 };

  test("refunds automatically until 48 hours before the start, and not a moment after", () => {
    expect(AUTOMATIC_REFUND_HOURS).toBe(48);
    expect(refundDeadline(startsAt).toISOString()).toBe("2026-11-18T08:00:00.000Z");
    expect(cancelOption(paid, startsAt, start - 49 * hour)).toBe("refund");
    expect(cancelOption(paid, startsAt, start - 48 * hour)).toBe("refund");
    expect(cancelOption(paid, startsAt, start - 48 * hour + 1)).toBe("request");
    expect(cancelOption(paid, startsAt, start - hour)).toBe("request");
  });

  test("closes once the event starts", () => {
    expect(cancelOption(paid, startsAt, start)).toBe("closed");
    expect(cancelOption({ payment_status: "free", amount_paid: null }, startsAt, start + hour)).toBe("closed");
  });

  test("a free booking, or one a code made free, has nothing to refund", () => {
    expect(cancelOption({ payment_status: "free", amount_paid: null }, startsAt, start - hour)).toBe("free");
    expect(cancelOption({ payment_status: "completed", amount_paid: 0 }, startsAt, start - 100 * hour)).toBe("free");
  });
});

test("an amount Stripe charged keeps its bani", () => {
  expect(formatPaid(45000, "ron", "ro")).toBe("450 RON");
  expect(formatPaid(40500, "ron", "ro")).toBe("405 RON");
  expect(formatPaid(13950, "ron", "ro")).toBe("139,50 RON");
  expect(formatPaid(13950, "eur", "en")).toBe("139.50 EUR");
});
