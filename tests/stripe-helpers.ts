import type { APIRequestContext } from "@playwright/test";
import { FAKE_STRIPE_URL, signedEvent, type Call } from "./fake-stripe";

/**
 * Steering the stand-in for Stripe (tests/fake-stripe.ts) from a test, and
 * sending the site webhooks the way Stripe signs them.
 */

async function control(path: string, body?: unknown) {
  const res = await fetch(`${FAKE_STRIPE_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`fake Stripe ${path} answered ${res.status}: ${await res.text()}`);
  return res.json();
}

export interface FakeSession {
  id: string;
  status: "open" | "complete" | "expired";
  payment_status: string;
  url: string | null;
  payment_intent: string | null;
  amount_total: number;
  currency: string;
  locale: string | null;
  metadata: Record<string, string>;
  success_url: string;
  cancel_url: string;
  payment_method_types: string[];
  allow_promotion_codes: boolean;
  params: Record<string, unknown>;
}

export interface FakeRefund {
  id: string;
  amount: number;
  payment_intent: string;
  status: string;
  reason: string | null;
}

/** Back to a clean Stripe: no sessions, no refunds, webhooks on, refunds allowed. */
export const resetStripe = () => control("/__control", { reset: true });

/** Webhooks off: the site must learn about a payment from the page the visitor comes back to. */
export const setStripeWebhooks = (on: boolean) => control("/__control", { webhooks: on });

/** Make Stripe refuse refunds, as it does when it cannot make one. */
export const setStripeRefundsFail = (fail: boolean) => control("/__control", { failRefunds: fail });

export const stripeSessions = (): Promise<FakeSession[]> => control("/__sessions");
export const stripeRefunds = (): Promise<FakeRefund[]> => control("/__refunds");
export const stripeCalls = (): Promise<Call[]> => control("/__calls");

/** The sessions created for a booking, oldest first. */
export async function sessionsFor(registrationId: string): Promise<FakeSession[]> {
  return (await stripeSessions()).filter((s) => s.metadata.registrationId === registrationId);
}

/** Pays a session as the visitor would, optionally without the webhook (Stripe late). */
export const paySession = (id: string, options: { webhook?: boolean; code?: string } = {}): Promise<FakeSession> =>
  control(`/__sessions/${id}/pay`, options);

/** Lets a session run out, optionally without the webhook. */
export const expireSession = (id: string, options: { webhook?: boolean } = {}): Promise<FakeSession> =>
  control(`/__sessions/${id}/expire`, options);

/** A refund made in her Stripe Dashboard: in full, or `amount` (minor units) for a partial one. */
export const refundInDashboard = (paymentIntent: string, amount?: number): Promise<FakeRefund> =>
  control(`/__payments/${paymentIntent}/refund`, amount === undefined ? {} : { amount });

/** Stripe reports that a refund failed. */
export const failRefund = (refundId: string): Promise<FakeRefund> => control(`/__refunds/${refundId}/fail`, {});

/**
 * Sends the site a webhook as Stripe would, signed with the suite's secret.
 * Returns the status the site answered with.
 */
export async function sendWebhook(type: string, object: unknown, signature?: string): Promise<number> {
  const signed = signedEvent(type, object);
  const res = await fetch("http://localhost:3100/api/stripe/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": signature ?? signed.signature },
    body: signed.payload,
  });
  return res.status;
}

/** Books through the API as the form does, with the always-passing test CAPTCHA. */
export async function bookByApi(
  request: APIRequestContext,
  eventId: string,
  email: string,
  options: { locale?: "ro" | "en"; fullName?: string } = {}
): Promise<{ status: number; body: { id?: string; checkoutUrl?: string; paid?: boolean; code?: string } }> {
  const res = await request.post("/api/register", {
    data: {
      eventId,
      fullName: options.fullName ?? "Ana Popescu",
      email,
      phone: "+40721112233",
      captchaToken: "XXXX.DUMMY.TOKEN.XXXX",
      locale: options.locale ?? "ro",
    },
  });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

/** The session id at the end of a payment page's address. */
export const sessionIdOf = (checkoutUrl: string) => checkoutUrl.split("/pay/")[1];

/** A paid booking, made the way a visitor makes one: booked, then paid on the stand-in's page. */
export async function paidBooking(request: APIRequestContext, eventId: string, email: string) {
  const { body } = await bookByApi(request, eventId, email);
  if (!body.id || !body.checkoutUrl) throw new Error(`paidBooking: no checkout (${JSON.stringify(body)})`);
  const session = await paySession(sessionIdOf(body.checkoutUrl));
  return { registrationId: body.id, sessionId: session.id, paymentIntent: session.payment_intent!, session };
}
