import { test, expect } from "@playwright/test";
import {
  adminAccessToken,
  deleteEventBySlug,
  emailsTo,
  noticesFor,
  registrationById,
  seedEvent,
  seedWaitingEntry,
  unique,
  updateRegistration,
  waitingEntry,
} from "./helpers";
import {
  bookByApi,
  expireSession,
  failRefund,
  paidBooking,
  paySession,
  refundInDashboard,
  resetStripe,
  sendWebhook,
  sessionIdOf,
  sessionsFor,
  stripeRefunds,
} from "./stripe-helpers";
import { FAKE_STRIPE_URL } from "./fake-stripe";

/**
 * The Stripe webhook (app/api/stripe/webhook), driven with events signed the
 * way Stripe signs them (audit T1), by the suite's stand-in for Stripe or by
 * the test directly. Every handler must be safe to receive twice, because
 * Stripe retries, and must leave alone what another copy of the site made.
 */

test.beforeEach(async () => {
  await resetStripe();
});

test.describe("the Stripe webhook", () => {
  test("refuses a request Stripe did not sign, and accepts an event it does not use", async () => {
    expect(await sendWebhook("checkout.session.completed", { id: "cs_test_x" }, "t=1,v1=forged")).toBe(400);
    expect(await sendWebhook("customer.created", { id: "cus_test_x" })).toBe(200);
  });

  test("a paid checkout confirms the booking once, however often Stripe reports it", async ({ request }) => {
    const event = await seedEvent({ price: 450, max_participants: 5 });
    const email = `${unique("paid")}@example.com`;
    try {
      const booking = await paidBooking(request, event.id, email);
      const row = await registrationById(booking.registrationId);
      expect(row?.payment_status).toBe("completed");
      expect(row?.stripe_payment_intent_id).toBe(booking.paymentIntent);
      expect(row?.stripe_session_id).toBe(booking.sessionId);
      expect(row?.amount_paid).toBe(45000);
      expect(row?.paid_currency).toBe("ron");

      // Stripe sends it again, as it does when it thinks a delivery failed.
      expect(await sendWebhook("checkout.session.completed", booking.session)).toBe(200);
      expect(await sendWebhook("checkout.session.completed", booking.session)).toBe(200);

      const emails = await emailsTo(email, 1);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(await emailsTo(email, 1), "one confirmation, not one per report").toHaveLength(emails.length);
      expect(emails).toHaveLength(1);
      expect(emails[0].Subject).toContain("Confirmare plată");
      // The cancel link, and until when cancelling refunds automatically.
      expect(emails[0].HTML).toMatch(/\/ro\/booking\?token=[A-Za-z0-9_-]{43}/);
      expect(emails[0].Text).toContain("Banii se returnează automat dacă anulezi până la");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a checkout complete but not yet paid gives no seat", async ({ request }) => {
    const event = await seedEvent({ price: 200, max_participants: 5 });
    try {
      const { body } = await bookByApi(request, event.id, `${unique("unpaid")}@example.com`);
      const [session] = await sessionsFor(body.id!);
      // A payment method whose money arrives days later reports this; the
      // site offers none, and must not hand over a seat for one.
      expect(
        await sendWebhook("checkout.session.completed", { ...session, status: "complete", payment_status: "unpaid" })
      ).toBe(200);
      expect((await registrationById(body.id!))?.payment_status).toBe("pending");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("an expired checkout frees its seat and puts the person who claimed it back in line", async ({ request }) => {
    const event = await seedEvent({ price: 150, max_participants: 1 });
    try {
      const entryId = await seedWaitingEntry(event.id, "open");
      const claim = await (await request.post(`/api/register/claim-spot/${entryId}`, { data: { locale: "ro" } })).json();
      const sessionId = sessionIdOf(claim.checkoutUrl);
      const booking = (await sessionsByUrl(claim.checkoutUrl)).metadata.registrationId;
      expect((await waitingEntry(entryId)).claimed_at).not.toBeNull();

      await expireSession(sessionId);

      expect(await registrationById(booking), "the unpaid booking is gone").toBeNull();
      const entry = await waitingEntry(entryId);
      // Back in line, and first: the seat is offered to them again. This is
      // the case that used to strand them, because the booking's deletion
      // cleared the column the claim was found by.
      expect(entry.claimed_at).toBeNull();
      expect(entry.claim_expires_at).not.toBeNull();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("an expired checkout that was replaced by a newer one frees nothing", async ({ request }) => {
    const event = await seedEvent({ price: 150, max_participants: 3 });
    try {
      const { body } = await bookByApi(request, event.id, `${unique("replaced")}@example.com`);
      const [first] = await sessionsFor(body.id!);
      // The booking moved on to another checkout (they came back later).
      await updateRegistration(body.id!, { stripe_session_id: "cs_test_newer_checkout_0001" });
      expect(await sendWebhook("checkout.session.expired", { ...first, status: "expired" })).toBe(200);
      expect(await registrationById(body.id!), "the booking lives on in the newer checkout").not.toBeNull();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("only a full refund frees the seat (B10), and one made in Stripe is reported to her", async ({ request }) => {
    const event = await seedEvent({ price: 400, max_participants: 5 });
    try {
      const booking = await paidBooking(request, event.id, `${unique("refund")}@example.com`);

      // Partial: the booking keeps its seat.
      await refundInDashboard(booking.paymentIntent, 10000);
      expect((await registrationById(booking.registrationId))?.payment_status).toBe("completed");

      // The rest: now it is a full refund.
      await refundInDashboard(booking.paymentIntent);
      await expect
        .poll(async () => (await registrationById(booking.registrationId))?.payment_status)
        .toBe("refunded");
      const row = await registrationById(booking.registrationId);
      expect(row?.refunded_at).not.toBeNull();

      const notices = await noticesFor(booking.registrationId);
      expect(notices.map((n) => n.kind)).toEqual(["refunded"]);
      expect(notices[0].details).toMatchObject({ amount: 40000, currency: "ron" });
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a refund the site made is not reported as one made in Stripe, and a failed one is", async ({ request }) => {
    const event = await seedEvent({ price: 300, max_participants: 5 });
    try {
      const booking = await paidBooking(request, event.id, `${unique("site-refund")}@example.com`);
      const res = await request.post(`/api/admin/participants/${booking.registrationId}`, {
        headers: { Authorization: `Bearer ${await adminAccessToken()}` },
        data: { action: "refunded" },
      });
      expect(res.status()).toBe(200);
      expect((await res.json()).throughStripe).toBe(true);

      const [refund] = await stripeRefunds();
      expect(refund).toMatchObject({ payment_intent: booking.paymentIntent, amount: 30000 });
      // Stripe's charge.refunded arrives after the site marked the booking.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(await noticesFor(booking.registrationId)).toEqual([]);

      // Stripe reports that the refund could not be made after all.
      await failRefund(refund.id);
      await expect.poll(async () => (await registrationById(booking.registrationId))?.refund_failed_at).not.toBeNull();
      expect((await noticesFor(booking.registrationId)).map((n) => n.kind)).toEqual(["refund_failed"]);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a second payment for one booking is refunded at once, and she is told", async ({ request }) => {
    const event = await seedEvent({ price: 250, max_participants: 5 });
    try {
      const booking = await paidBooking(request, event.id, `${unique("twice")}@example.com`);
      // A second session for the same booking, paid: what the compare-and-set
      // prevents, made here directly at Stripe.
      const second = await createSessionAtStripe({ ...booking.session.metadata });
      const paid = await paySession(second.id);

      await expect.poll(async () => (await stripeRefunds()).map((r) => r.payment_intent)).toContain(paid.payment_intent);
      const refund = (await stripeRefunds()).find((r) => r.payment_intent === paid.payment_intent)!;
      expect(refund).toMatchObject({ amount: 25000, reason: "duplicate" });
      // Stripe's report of that refund leaves the paid booking as it is.
      expect(
        await sendWebhook("charge.refunded", {
          id: `ch_${paid.payment_intent!.slice(3)}`,
          object: "charge",
          amount: paid.amount_total,
          amount_refunded: paid.amount_total,
          refunded: true,
          currency: paid.currency,
          payment_intent: paid.payment_intent,
        })
      ).toBe(200);
      const row = await registrationById(booking.registrationId);
      expect(row?.payment_status, "the first payment stands").toBe("completed");
      expect(row?.stripe_payment_intent_id).toBe(booking.paymentIntent);
      const notices = await noticesFor(booking.registrationId);
      expect(notices.map((n) => [n.kind, n.details.reason])).toEqual([["payment_returned", "paid_twice"]]);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a payment for a booking she removed meanwhile is refunded", async ({ request }) => {
    const event = await seedEvent({ price: 180, max_participants: 5 });
    try {
      const { body } = await bookByApi(request, event.id, `${unique("removed")}@example.com`);
      await updateRegistration(body.id!, { removed_at: new Date().toISOString(), removal_reason: "Test" });
      const paid = await paySession(sessionIdOf(body.checkoutUrl!));
      await expect.poll(async () => (await stripeRefunds()).map((r) => r.payment_intent)).toContain(paid.payment_intent);
      // Stripe then reports that refund like any other. It must not turn the
      // unpaid booking into a refunded one, nor reach her as a refund made in
      // Stripe: the full suite once caught exactly that, by timing.
      expect(
        await sendWebhook("charge.refunded", {
          id: `ch_${paid.payment_intent!.slice(3)}`,
          object: "charge",
          amount: paid.amount_total,
          amount_refunded: paid.amount_total,
          refunded: true,
          currency: paid.currency,
          payment_intent: paid.payment_intent,
        })
      ).toBe(200);
      expect((await registrationById(body.id!))?.payment_status, "still not a seat").toBe("pending");
      expect((await noticesFor(body.id!)).map((n) => [n.kind, n.details.reason])).toEqual([["payment_returned", "no_seat"]]);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a checkout made by another copy of the site is left alone", async ({ request }) => {
    const event = await seedEvent({ price: 120, max_participants: 5 });
    try {
      const { body } = await bookByApi(request, event.id, `${unique("foreign")}@example.com`);
      const [session] = await sessionsFor(body.id!);
      const foreign = {
        ...session,
        status: "complete",
        payment_status: "paid",
        payment_intent: "pi_test_from_elsewhere_0001",
        metadata: { ...session.metadata, db: "another.supabase.co" },
      };
      expect(await sendWebhook("checkout.session.completed", foreign)).toBe(200);
      expect(await sendWebhook("checkout.session.expired", { ...foreign, status: "expired" })).toBe(200);
      const row = await registrationById(body.id!);
      expect(row?.payment_status, "not confirmed by a payment it never got").toBe("pending");
      expect(await stripeRefunds(), "and nobody else's payment refunded").toEqual([]);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});

/** The stand-in's session behind a payment page's address. */
async function sessionsByUrl(checkoutUrl: string) {
  const res = await fetch(`${FAKE_STRIPE_URL}/__sessions`);
  const all: Array<{ id: string; metadata: Record<string, string> }> = await res.json();
  return all.find((s) => s.id === sessionIdOf(checkoutUrl))!;
}

/** Creates a session at the stand-in directly, as if a second request had made one. */
async function createSessionAtStripe(metadata: Record<string, string>) {
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "ron",
    "line_items[0][price_data][unit_amount]": "25000",
    "line_items[0][price_data][product_data][name]": "Second",
    "line_items[0][quantity]": "1",
    success_url: "http://localhost:3100/ro",
    cancel_url: "http://localhost:3100/ro",
  });
  for (const [key, value] of Object.entries(metadata)) form.set(`metadata[${key}]`, value);
  const res = await fetch(`${FAKE_STRIPE_URL}/v1/checkout/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  return (await res.json()) as { id: string };
}
