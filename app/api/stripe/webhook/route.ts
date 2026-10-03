import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  fulfilCheckout,
  recordRefundFailure,
  recordStripeRefund,
  releaseCheckout,
  sessionOrigin,
} from "@/lib/payments";

/**
 * Stripe's reports about payments, signed with the endpoint's secret.
 *
 * The events the Stripe Dashboard's endpoint should send, and what each does:
 *
 *   checkout.session.completed  A booking is paid: it is marked so and the
 *                               confirmation goes out (lib/payments.ts). The
 *                               event page the visitor returns to does the same
 *                               if it gets there first; the two cannot both.
 *   checkout.session.expired    A checkout nobody paid: its seat comes back,
 *                               and goes to the waiting list.
 *   charge.refunded             A refund. Only a full one frees a seat (audit
 *                               B10); one made in her Stripe Dashboard is
 *                               reported to her on the dashboard.
 *   refund.failed               Stripe could not return a refund (it can happen
 *                               with Revolut Pay, whose refunds settle within
 *                               minutes): the booking and a notice say so.
 *
 * Also handled if sent: checkout.session.async_payment_succeeded (a payment
 * method that settles later, which the site does not offer) and the older
 * refund.updated / charge.refund.updated, for a refund whose status became
 * failed.
 *
 * Every handler is safe to receive twice: Stripe retries an event it thinks
 * failed, and may send events out of order.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  // Without a valid signature this is not Stripe, or the secret does not
  // match this endpoint's. Stripe retries anything that is not a 2xx, so
  // events refused while the secret was wrong arrive once it is fixed.
  let event: Stripe.Event;
  try {
    if (!signature || !secret) throw new Error("Missing signature or webhook secret");
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    // The message says enough; the error object carries the whole payload.
    console.error("Stripe webhook refused:", (error as Error).message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await fulfilCheckout(event.data.object);
        break;

      case "checkout.session.expired": {
        const session = event.data.object;
        const registrationId = session.metadata?.registrationId;
        if (registrationId && sessionOrigin(session) !== "foreign") {
          await releaseCheckout(session.id, registrationId);
        }
        break;
      }

      case "charge.refunded":
        await recordStripeRefund(event.data.object);
        break;

      case "refund.failed":
        await recordRefundFailure(event.data.object);
        break;

      case "refund.updated":
      case "charge.refund.updated":
        if (event.data.object.status === "failed") await recordRefundFailure(event.data.object);
        break;
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    // Our side failed (the database, Stripe's API, the mail): 500, so Stripe
    // sends the event again, for up to three days.
    console.error(`Stripe webhook ${event.type} (${event.id}) failed:`, error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
