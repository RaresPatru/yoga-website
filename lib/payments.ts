import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { databaseTag } from "@/lib/local-database";
import { sendConfirmationEmail } from "@/lib/send-confirmation-email";
import { notifyWaitingList } from "@/lib/notify-waiting-list";
import { recordNotice } from "@/lib/admin-notices";

/**
 * What happens to the money once Stripe has it, or once it is clear it will
 * not come: a paid checkout becomes a booking, an unpaid one gives its seat
 * back, and refunds. Server only.
 *
 * Called from three places, each of which can arrive first or not at all:
 * the webhook (app/api/stripe/webhook), the event page the visitor comes back
 * to (app/api/checkout), and the admin panel and cancel link for refunds. So
 * everything here is safe to run twice, and checks the booking's state in the
 * same statement that changes it.
 */

/** The id behind a field Stripe sends either as an id or as the expanded object. */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/**
 * Whose session this is: made by this copy of the site ("ours"), by another
 * copy sharing the Stripe account, such as a local run ("foreign"), or before
 * sessions said ("untagged"). See databaseTag() in lib/local-database.ts.
 */
export function sessionOrigin(session: Pick<Stripe.Checkout.Session, "metadata">): "ours" | "foreign" | "untagged" {
  const tag = session.metadata?.db;
  if (!tag) return "untagged";
  return tag === databaseTag() ? "ours" : "foreign";
}

/**
 * Whether a session's money is in. `no_payment_required` is a promotion code
 * that took the price to nothing. A session can be complete and still
 * `unpaid` with a payment method whose money arrives later; the site offers
 * none, but a seat is never given on the strength of one.
 */
export function isPaid(session: Pick<Stripe.Checkout.Session, "status" | "payment_status">): boolean {
  return (
    session.status === "complete" &&
    (session.payment_status === "paid" || session.payment_status === "no_payment_required")
  );
}

export type FulfilResult = "completed" | "already" | "returned" | "unpaid" | "ignored";

/**
 * Turns a paid Checkout session into a booking: marks it paid, records what
 * was charged and with which code, and sends the confirmation with the
 * calendar invitation, the WhatsApp group and the cancel link. This is
 * Stripe's `fulfill_checkout` (docs.stripe.com/checkout/fulfillment), run by
 * the webhook and by the page the visitor returns to, possibly both at once.
 *
 * Only a booking still `pending` changes, and Postgres lets one of two
 * simultaneous updates through, so the confirmation goes once.
 *
 * Money with no pending booking behind it is money for a seat that is not
 * there:
 *   - Stripe reporting the same payment twice: the booking already carries
 *     this session. Nothing to do.
 *   - Paid twice for one booking, or for a booking she removed while they
 *     were paying, or one deleted with its event: the payment is refunded in
 *     full, at once, and she sees a notice on her dashboard.
 * A session from before sessions named their database is never refunded this
 * way, since it cannot be told apart from another copy's.
 */
export async function fulfilCheckout(session: Stripe.Checkout.Session): Promise<FulfilResult> {
  const registrationId = session.metadata?.registrationId;
  const origin = sessionOrigin(session);
  if (!registrationId || origin === "foreign") return "ignored";
  if (!isPaid(session)) return "unpaid";

  const supabase = createAdminClient();
  const paymentIntentId = idOf(session.payment_intent);

  const { data: completed, error } = await supabase
    .from("registrations")
    .update({
      payment_status: "completed",
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      amount_paid: session.amount_total,
      paid_currency: session.currency,
      discount_code: await discountCodeOf(session),
    })
    .eq("id", registrationId)
    .eq("payment_status", "pending")
    .is("removed_at", null)
    .is("cancelled_at", null)
    .select("id, event_id, full_name, email, locale")
    .maybeSingle();
  if (error) throw error;

  if (completed) {
    await sendConfirmationEmail({
      registrationId: completed.id,
      eventId: completed.event_id,
      fullName: completed.full_name,
      email: completed.email,
      locale: completed.locale === "en" ? "en" : "ro",
      templateType: "payment_confirmation",
    });
    return "completed";
  }

  const { data: booking, error: readError } = await supabase
    .from("registrations")
    .select("id, event_id, payment_status, stripe_session_id, stripe_payment_intent_id")
    .eq("id", registrationId)
    .maybeSingle();
  if (readError) throw readError;

  const sameSession =
    booking !== null &&
    (booking.stripe_session_id === session.id ||
      (paymentIntentId !== null && booking.stripe_payment_intent_id === paymentIntentId));
  if (booking && booking.payment_status !== "pending" && sameSession) return "already";

  if (origin === "untagged") {
    console.error(`Paid checkout ${session.id} has no booking waiting for it; check it in Stripe.`);
    return "ignored";
  }

  await returnPayment(session, booking, booking?.payment_status === "completed" ? "paid_twice" : "no_seat");
  return "returned";
}

/** The promotion code a session was paid with, or null. Asks Stripe only when there was a discount. */
async function discountCodeOf(session: Stripe.Checkout.Session): Promise<string | null> {
  if (!session.total_details?.amount_discount) return null;
  const inline = session.discounts?.[0]?.promotion_code;
  if (inline && typeof inline !== "string") return inline.code;
  try {
    const full = await getStripe().checkout.sessions.retrieve(session.id, { expand: ["discounts.promotion_code"] });
    const code = full.discounts?.[0]?.promotion_code;
    return code && typeof code !== "string" ? code.code : null;
  } catch (error) {
    console.error(`Could not read the promotion code of ${session.id}:`, error);
    return null;
  }
}

/**
 * Refunds, in full, a payment that has no seat behind it, and tells her. The
 * idempotency key ties the refund to the session, so the webhook and the
 * return page reporting the same payment refund it once.
 */
async function returnPayment(
  session: Stripe.Checkout.Session,
  booking: { id: string; event_id: string } | null,
  reason: "paid_twice" | "no_seat"
): Promise<void> {
  const paymentIntentId = idOf(session.payment_intent);
  if (paymentIntentId) {
    await getStripe().refunds.create(
      {
        payment_intent: paymentIntentId,
        reason: reason === "paid_twice" ? "duplicate" : "requested_by_customer",
        metadata: { registrationId: session.metadata?.registrationId ?? "", returned: reason },
      },
      { idempotencyKey: `return-${session.id}` }
    );
  }
  await recordNotice({
    kind: "payment_returned",
    registrationId: booking?.id ?? null,
    eventId: booking?.event_id ?? null,
    details: {
      reason,
      amount: session.amount_total,
      currency: session.currency,
      // When no booking is left, this is the only way she can tell who paid.
      name: booking ? undefined : (session.customer_details?.name ?? undefined),
      email: booking ? undefined : (session.customer_details?.email ?? session.customer_email ?? undefined),
    },
    sourceId: `session:${session.id}`,
  });
}

/**
 * Gives back the seat of a checkout that was never paid: its session expired,
 * or the visitor gave it up. Only while that session is still the booking's
 * current one; an expired session that a newer one replaced frees nothing,
 * because the booking carries on in the newer one.
 *
 * Someone who claimed the seat from the waiting list goes back in line, in
 * their old place: `created_at` is untouched. They are found before the
 * booking goes, because deleting it clears `claimed_registration_id` (the
 * foreign key is ON DELETE SET NULL), and finding them afterwards, by that
 * column, is how an expired claim used to strand them off the list for good.
 *
 * Returns whether a seat was freed.
 */
export async function releaseCheckout(sessionId: string, registrationId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: claims, error: claimsError } = await supabase
    .from("waiting_list")
    .select("id")
    .eq("claimed_registration_id", registrationId);
  if (claimsError) throw claimsError;

  const { data: released, error } = await supabase
    .from("registrations")
    .delete()
    .eq("id", registrationId)
    .eq("payment_status", "pending")
    .or(`stripe_session_id.eq.${sessionId},stripe_session_id.is.null`)
    .select("event_id")
    .maybeSingle();
  if (error) throw error;
  if (!released) return false;

  if (claims?.length) {
    const { error: returnError } = await supabase
      .from("waiting_list")
      .update({ claimed_at: null, claimed_registration_id: null, notified_at: null, claim_expires_at: null })
      .in(
        "id",
        claims.map((c) => c.id)
      );
    if (returnError) console.error("Could not put a lapsed claim back in line:", returnError);
  }

  await notifyWaitingList(released.event_id);
  return true;
}

/** The booking a Stripe payment belongs to, with what a refund needs. */
interface PaidBooking {
  id: string;
  event_id: string;
  payment_status: string;
  refund_requested_at: string | null;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string | null;
  amount_paid: number | null;
  paid_currency: string | null;
}

const PAID_BOOKING_COLUMNS =
  "id, event_id, payment_status, refund_requested_at, stripe_payment_intent_id, stripe_session_id, amount_paid, paid_currency";

/**
 * Finds the booking a payment belongs to. Bookings paid before 3 October 2026
 * recorded only their session, so for those Stripe is asked which session the
 * payment came from, and the answer is kept on the booking.
 */
async function bookingByPaymentIntent(paymentIntentId: string): Promise<PaidBooking | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("registrations")
    .select(PAID_BOOKING_COLUMNS)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const sessions = await getStripe().checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
  const session = sessions.data[0];
  if (!session) return null;
  const { data: bySession, error: sessionError } = await supabase
    .from("registrations")
    .select(PAID_BOOKING_COLUMNS)
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (sessionError) throw sessionError;
  return bySession;
}

/** The payment to refund a booking against: recorded, or found through its session. */
async function paymentIntentOf(booking: PaidBooking): Promise<string | null> {
  if (booking.stripe_payment_intent_id) return booking.stripe_payment_intent_id;
  if (!booking.stripe_session_id) return null;
  const session = await getStripe().checkout.sessions.retrieve(booking.stripe_session_id);
  return idOf(session.payment_intent);
}

/**
 * Marks a paid booking refunded, which frees its seat. Returns its event, or
 * null when there was nothing to mark: refunded already, or never paid. The
 * second matters for a payment the site returned because its booking was
 * gone (`returnPayment`): Stripe reports that refund too, and the unpaid
 * booking it was meant for must not become a refunded one.
 */
async function markRefunded(registrationId: string, paymentIntentId: string | null): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("registrations")
    .update({
      payment_status: "refunded",
      refunded_at: new Date().toISOString(),
      ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
    })
    .eq("id", registrationId)
    .eq("payment_status", "completed")
    .select("event_id")
    .maybeSingle();
  if (error) throw error;
  return data?.event_id ?? null;
}

export type RefundOutcome =
  | { ok: true; amount: number | null; currency: string | null }
  | { ok: false; reason: "state" | "no_payment" }
  | { ok: false; reason: "stripe"; message: string };

/** Stripe's answer when the whole payment has already been refunded, in her Dashboard or by an earlier press. */
function alreadyRefunded(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "charge_already_refunded";
}

/**
 * Refunds a paid booking through Stripe, in full, and marks it refunded, which
 * frees its seat. Rares' rule (3 October 2026): refunds are never partial.
 * The caller offers the seat to the waiting list.
 *
 * The booking is marked as having a refund asked for before Stripe is called.
 * When Stripe then reports the refund (charge.refunded), the webhook can tell
 * one the site made from one she made in her Stripe Dashboard, which is the
 * kind she is told about. The idempotency key turns a second press, or a
 * retry, into the same refund rather than another.
 *
 * `no_payment`: a booking with no Stripe payment behind it (marked paid by
 * hand, or seeded locally), which only she can refund.
 */
export async function refundBooking(registrationId: string): Promise<RefundOutcome> {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase
    .from("registrations")
    .select(PAID_BOOKING_COLUMNS)
    .eq("id", registrationId)
    .maybeSingle();
  if (error) throw error;
  if (!booking || booking.payment_status !== "completed") return { ok: false, reason: "state" };

  const paymentIntentId = await paymentIntentOf(booking);
  if (!paymentIntentId) return { ok: false, reason: "no_payment" };

  if (!booking.refund_requested_at) {
    const { error: markError } = await supabase
      .from("registrations")
      .update({ refund_requested_at: new Date().toISOString() })
      .eq("id", registrationId)
      .is("refund_requested_at", null);
    if (markError) throw markError;
  }

  let refund: Stripe.Refund | null = null;
  try {
    refund = await getStripe().refunds.create(
      { payment_intent: paymentIntentId, reason: "requested_by_customer", metadata: { registrationId } },
      { idempotencyKey: `refund-${registrationId}` }
    );
  } catch (stripeError) {
    if (!alreadyRefunded(stripeError)) {
      console.error(`Stripe refused the refund for booking ${registrationId}:`, stripeError);
      return { ok: false, reason: "stripe", message: (stripeError as Error).message ?? "Stripe error" };
    }
  }

  await markRefunded(registrationId, paymentIntentId);
  return {
    ok: true,
    amount: refund?.amount ?? booking.amount_paid,
    currency: refund?.currency ?? booking.paid_currency,
  };
}

/**
 * A refund Stripe reports (charge.refunded): a seat comes free only when the
 * whole payment went back (audit B10). Rares' rule is full refunds only, but
 * her Stripe Dashboard can still make a partial one; that leaves the booking
 * as it is.
 *
 * A refund the site made is already marked on the booking. One made in her
 * Stripe Dashboard for a booking nobody asked to refund is new to the site:
 * the booking is marked, the seat is offered on, and she sees a notice.
 */
export async function recordStripeRefund(charge: Stripe.Charge): Promise<void> {
  if (!charge.refunded) {
    console.info(`Partial refund on charge ${charge.id}; the booking keeps its seat.`);
    return;
  }
  const paymentIntentId = idOf(charge.payment_intent);
  if (!paymentIntentId) return;

  const booking = await bookingByPaymentIntent(paymentIntentId);
  // Only a paid booking can be refunded. Anything else is a payment the site
  // returned itself, already reported to her as returned.
  if (!booking || booking.payment_status !== "completed") return;

  const eventId = await markRefunded(booking.id, paymentIntentId);
  if (!eventId) return;

  if (!booking.refund_requested_at) {
    await recordNotice({
      kind: "refunded",
      registrationId: booking.id,
      eventId,
      details: { amount: charge.amount_refunded, currency: charge.currency },
      sourceId: `charge:${charge.id}`,
    });
  }
  await notifyWaitingList(eventId);
}

/**
 * Stripe could not return a refund (refund.failed). The money went back to
 * her Stripe balance, and the person has to be paid some other way. The
 * booking keeps its refunded status, since the seat may already have gone to
 * someone else, and is marked so the panel and a notice say what happened.
 */
export async function recordRefundFailure(refund: Stripe.Refund): Promise<void> {
  const paymentIntentId = idOf(refund.payment_intent);
  if (!paymentIntentId) return;
  const booking = await bookingByPaymentIntent(paymentIntentId);
  if (!booking) return;

  const { error } = await createAdminClient()
    .from("registrations")
    .update({ refund_failed_at: new Date().toISOString() })
    .eq("id", booking.id);
  if (error) throw error;

  await recordNotice({
    kind: "refund_failed",
    registrationId: booking.id,
    eventId: booking.event_id,
    details: { amount: refund.amount, currency: refund.currency, reason: refund.failure_reason ?? null },
    sourceId: `refund_failed:${refund.id}`,
  });
}
