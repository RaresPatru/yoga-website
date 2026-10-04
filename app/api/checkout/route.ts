import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe";
import { closeCheckout, HoldLapsed, openCheckout, PENDING_HOLD_MINUTES } from "@/lib/stripe-checkout";
import { fulfilCheckout, isPaid, releaseCheckout, sessionOrigin } from "@/lib/payments";

/**
 * What became of a Stripe checkout, asked by the event page a visitor comes
 * back to: Stripe writes the session's id into both return addresses
 * (`?checkout=<id>`, with `&paid=1` after paying).
 *
 *   status   paid       the booking is confirmed. Checked with Stripe and
 *                       recorded here if the webhook has not arrived yet, as
 *                       Stripe's fulfilment guide recommends: a webhook can
 *                       be late, the visitor is here now.
 *            open       they turned back; the seat stays theirs until `until`
 *            expired    the checkout closed unpaid, and the seat went with it
 *            returned   paid, but the booking was gone, so the money was
 *                       refunded (lib/payments.ts)
 *            unknown    no checkout of this site's by that id
 *   resume   back to that checkout, or a new one for the same booking
 *   release  they give the seat up now instead of letting it lapse
 *
 * The session id is the only key, and it is what Stripe gives the visitor:
 * long, random, and good only for this one checkout's state. Nothing personal
 * comes back.
 */

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
const ACTIONS = ["status", "resume", "release"] as const;
type Action = (typeof ACTIONS)[number];

type CheckoutState = "paid" | "open" | "expired" | "returned" | "released" | "unknown";

function answer(state: CheckoutState, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ state, ...extra });
}

export async function POST(req: Request) {
  try {
    if (!rateLimit(`checkout-return:${clientIp(req)}`, 40)) {
      return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.session === "string" ? body.session : "";
    const action: Action = ACTIONS.includes(body?.action) ? body.action : "status";
    const locale = body?.locale === "en" ? "en" : "ro";
    if (!SESSION_ID.test(sessionId)) {
      return NextResponse.json({ error: "Unknown checkout", code: "invalid" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: booking, error } = await supabase
      .from("registrations")
      .select(
        "id, email, payment_status, removed_at, checkout_started_at, created_at, stripe_session_id, events!inner(id, slug, title_ro, title_en, price, currency, starts_at)"
      )
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (error) throw error;

    // Recorded already, by the webhook (Stripe waits up to ten seconds for
    // it before sending the visitor back, so this is the usual answer).
    if (booking?.payment_status === "completed") return answer("paid");

    let session: Stripe.Checkout.Session;
    try {
      session = await getStripe().checkout.sessions.retrieve(sessionId);
    } catch (stripeError) {
      if ((stripeError as { code?: string }).code === "resource_missing") return answer("unknown");
      throw stripeError;
    }
    if (sessionOrigin(session) === "foreign") return answer("unknown");

    if (isPaid(session)) {
      const result = await fulfilCheckout(session);
      return answer(result === "returned" ? "returned" : result === "ignored" ? "unknown" : "paid");
    }

    const pending = booking && booking.payment_status === "pending" && !booking.removed_at ? booking : null;
    const event = pending ? (Array.isArray(pending.events) ? pending.events[0] : pending.events) : null;

    if (session.status === "open") {
      if (!pending || !event) return answer("unknown");

      if (action === "release") {
        await closeCheckout(sessionId);
        // Paid in the moment between: that payment stands.
        const after = await getStripe().checkout.sessions.retrieve(sessionId);
        if (isPaid(after)) {
          await fulfilCheckout(after);
          return answer("paid");
        }
        await releaseCheckout(sessionId, pending.id);
        return answer("released");
      }

      if (action === "resume") return resume(pending, event, locale, sessionId);

      // The seat is theirs until the session closes, or the hold ends if
      // that comes first.
      const holdEnds =
        Date.parse(pending.checkout_started_at ?? pending.created_at) + PENDING_HOLD_MINUTES * 60_000;
      return answer("open", { until: new Date(Math.min(session.expires_at * 1000, holdEnds)).toISOString() });
    }

    if (session.status === "expired") {
      // The webhook frees the seat too; whichever is first does it.
      if (pending && pending.stripe_session_id === sessionId) {
        if (action === "resume" && event) {
          const resumed = await resume(pending, event, locale, sessionId);
          if (resumed) return resumed;
        }
        await releaseCheckout(sessionId, pending.id);
      }
      return answer("expired");
    }

    return answer("unknown");
  } catch (error) {
    console.error("Checkout return error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Sends them back to pay for the same booking: the same session if it is
 * still open, or a new one while the booking holds its seat.
 */
async function resume(
  booking: { id: string; email: string },
  event: { id: string; slug: string; title_ro: string; title_en: string | null; price: number; currency: string },
  locale: "ro" | "en",
  sessionId: string
) {
  try {
    const opening = await openCheckout({
      event,
      registrationId: booking.id,
      email: booking.email,
      locale,
      previousSessionId: sessionId,
    });
    if ("paid" in opening) {
      await fulfilCheckout(opening.session);
      return answer("paid");
    }
    return answer("open", { url: opening.url });
  } catch (error) {
    if (error instanceof HoldLapsed) return answer("expired");
    throw error;
  }
}
