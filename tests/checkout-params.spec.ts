import { test, expect } from "@playwright/test";
import { checkoutSessionParams, CHECKOUT_WINDOW_SECONDS } from "../lib/stripe-checkout";
import { siteUrl } from "../lib/site-config";

/**
 * The parameters every Stripe Checkout session is built from, checked without
 * a Stripe account. Both paid booking paths (a normal booking and a
 * waiting-list claim) build their sessions with checkoutSessionParams, so these
 * tests cover both.
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

test("return addresses come from the site's own URL, never the request (S4)", () => {
  const params = checkoutSessionParams({ event, registrationId: "r1", locale: "en" });
  const base = siteUrl();
  expect(params.success_url).toBe(`${base}/en/events/${event.slug}?success=1`);
  expect(params.cancel_url).toBe(`${base}/en/events/${event.slug}?canceled=1`);
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

test("carries the ids the webhook needs and expires within the seat hold", () => {
  const now = Date.UTC(2026, 8, 24, 12, 0, 0);
  const params = checkoutSessionParams({ event, registrationId: "r42", locale: "ro" }, now);
  expect(params.metadata).toEqual({ eventId: event.id, registrationId: "r42" });
  expect(params.expires_at).toBe(now / 1000 + CHECKOUT_WINDOW_SECONDS);
  // The database stops holding a pending seat after an hour.
  expect(CHECKOUT_WINDOW_SECONDS).toBeLessThan(60 * 60);
});
