import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, plausibleToken } from "@/lib/tokens";
import { notifyWaitingList } from "@/lib/notify-waiting-list";
import { recordNotice, type CancelRefund } from "@/lib/admin-notices";
import { refundBooking } from "@/lib/payments";
import { cancelOption, type CancelOption } from "@/lib/cancel-rules";

/**
 * Cancelling a booking from the link in its confirmation email
 * (/[locale]/booking?token=…), by the rules in lib/cancel-rules.ts. Server
 * only: the link's token is looked up by its hash with the service key.
 */

/** A booking as its cancel page shows it. */
export interface BookingByLink {
  id: string;
  eventId: string;
  fullName: string;
  locale: "ro" | "en";
  paymentStatus: string;
  amountPaid: number | null;
  paidCurrency: string | null;
  cancelledAt: string | null;
  removedAt: string | null;
  refundRequestedAt: string | null;
  refundedAt: string | null;
  event: {
    slug: string;
    titleRo: string;
    titleEn: string | null;
    date: string;
    time: string | null;
    endDate: string | null;
    endTime: string | null;
    location: string | null;
    price: number;
    currency: string;
    startsAt: string;
  };
}

/** The booking a link's token belongs to, or null for a token that matches none. */
export async function bookingByLink(token: string | null | undefined): Promise<BookingByLink | null> {
  if (!plausibleToken(token)) return null;
  const { data, error } = await createAdminClient()
    .from("registrations")
    .select(
      "id, event_id, full_name, locale, payment_status, amount_paid, paid_currency, cancelled_at, removed_at, refund_requested_at, refunded_at, events!inner(slug, title_ro, title_en, date, time, end_date, end_time, location, price, currency, starts_at)"
    )
    .eq("cancel_token_hash", hashToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const event = Array.isArray(data.events) ? data.events[0] : data.events;
  return {
    id: data.id,
    eventId: data.event_id,
    fullName: data.full_name,
    locale: data.locale === "en" ? "en" : "ro",
    paymentStatus: data.payment_status,
    amountPaid: data.amount_paid,
    paidCurrency: data.paid_currency,
    cancelledAt: data.cancelled_at,
    removedAt: data.removed_at,
    refundRequestedAt: data.refund_requested_at,
    refundedAt: data.refunded_at,
    event: {
      slug: event.slug,
      titleRo: event.title_ro,
      titleEn: event.title_en,
      date: event.date,
      time: event.time,
      endDate: event.end_date,
      endTime: event.end_time,
      location: event.location,
      price: event.price,
      currency: event.currency,
      startsAt: event.starts_at,
    },
  };
}

/** Whether the booking still holds its seat, so that cancelling it means something. */
export function isActive(b: Pick<BookingByLink, "cancelledAt" | "removedAt" | "paymentStatus">): boolean {
  return !b.cancelledAt && !b.removedAt && (b.paymentStatus === "free" || b.paymentStatus === "completed");
}

/** What the booking's link can do right now. */
export function optionFor(b: BookingByLink, now: number = Date.now()): CancelOption {
  return cancelOption({ payment_status: b.paymentStatus, amount_paid: b.amountPaid }, b.event.startsAt, now);
}

/**
 * The outcome of pressing Cancel:
 *   cancelled      a free booking, cancelled
 *   refunded       cancelled and refunded automatically
 *   requested      cancelled; the refund waits for her decision
 *   refund_failed  cancelled; the automatic refund did not go through, so it
 *                  waits for her like a requested one
 *   closed         the event has started
 *   inactive       already cancelled, removed or refunded: nothing changed
 *   unknown        the link matches no booking
 */
export type CancelOutcome = "cancelled" | "refunded" | "requested" | "refund_failed" | "closed" | "inactive" | "unknown";

/**
 * Cancels the booking a link belongs to.
 *
 * The cancellation comes first, in one conditional update, so two presses
 * cancel once and the seat is free whatever happens to the refund. Then,
 * when the rules give an automatic refund, Stripe is asked for it. If Stripe
 * cannot do it, the booking is left as "refund requested", the state she
 * already deals with, rather than undoing the cancellation: they did cancel,
 * and their seat should go to someone who can come.
 *
 * She hears of every cancellation through a notice on her dashboard (Rares,
 * 3 October 2026), and the freed seat is offered to the waiting list.
 */
export async function cancelBooking(token: string | null | undefined, now: number = Date.now()): Promise<CancelOutcome> {
  const booking = await bookingByLink(token);
  if (!booking) return "unknown";
  if (!isActive(booking)) return "inactive";

  const option = optionFor(booking, now);
  if (option === "closed") return "closed";

  const at = new Date(now).toISOString();
  const { data: cancelled, error } = await createAdminClient()
    .from("registrations")
    .update({
      cancelled_at: at,
      ...(option === "free" ? {} : { refund_requested_at: booking.refundRequestedAt ?? at }),
    })
    .eq("id", booking.id)
    .is("cancelled_at", null)
    .is("removed_at", null)
    .in("payment_status", ["free", "completed"])
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!cancelled) return "inactive";

  let refund: CancelRefund = option === "free" ? "none" : "requested";
  let amount = booking.amountPaid;
  let currency = booking.paidCurrency;
  if (option === "refund") {
    const outcome = await refundBooking(booking.id);
    if (outcome.ok) {
      refund = "automatic";
      amount = outcome.amount ?? amount;
      currency = outcome.currency ?? currency;
    } else {
      // A booking with no Stripe payment behind it is hers to refund; one
      // Stripe refused is too, and the notice says it failed.
      refund = outcome.reason === "no_payment" ? "requested" : "failed";
    }
  }

  await recordNotice({
    kind: "cancelled",
    registrationId: booking.id,
    eventId: booking.eventId,
    details: { refund, amount, currency: currency ?? booking.event.currency.toLowerCase() },
    sourceId: `cancel:${booking.id}`,
  });
  await notifyWaitingList(booking.eventId);

  return refund === "automatic" ? "refunded" : refund === "none" ? "cancelled" : refund === "failed" ? "refund_failed" : "requested";
}
