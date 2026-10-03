/**
 * What cancelling a booking does with the money, as rules with no database in
 * them, so the server that cancels, the page that explains it and the email
 * that announces the deadline all read the same ones.
 *
 * Rares' rules of 3 October 2026, provisional until the instructor confirms
 * them (the drafted terms say the same, in legal.terms):
 *
 *   - A booking can be cancelled from the link in its confirmation email
 *     until the event starts.
 *   - A paid booking cancelled at least 48 hours before the start is refunded
 *     automatically, in full.
 *   - Cancelled later, the seat is freed and the refund is hers to decide:
 *     the booking waits in Înscrieri as "refund requested".
 *   - Refunds are always in full, never partial.
 *
 * The law leaves the window to her: the 14-day right to withdraw does not
 * apply to leisure services booked for a specific date (Directive
 * 2011/83/EU art. 16(l), OUG 34/2014 art. 16 lit. l), so what the terms say,
 * shown before booking, is the rule. If she cancels an event herself,
 * everyone is refunded in full.
 */

/** How long before the start a cancellation still refunds automatically. */
export const AUTOMATIC_REFUND_HOURS = 48;

const HOUR_MS = 60 * 60 * 1000;

/**
 * What cancelling now would do:
 *   free     nothing to refund (a free booking, or one a promotion code made free)
 *   refund   refunded automatically, in full
 *   request  the seat is freed, and the refund waits for her
 *   closed   the event has started, and the booking can no longer be cancelled here
 */
export type CancelOption = "free" | "refund" | "request" | "closed";

export interface CancellableBooking {
  payment_status: string;
  /** What Stripe charged, when known: 0 for a booking a promotion code made free. */
  amount_paid: number | null;
}

/** The last moment a cancellation refunds automatically. */
export function refundDeadline(startsAt: string): Date {
  return new Date(Date.parse(startsAt) - AUTOMATIC_REFUND_HOURS * HOUR_MS);
}

export function cancelOption(booking: CancellableBooking, startsAt: string, now: number = Date.now()): CancelOption {
  if (Date.parse(startsAt) <= now) return "closed";
  if (booking.payment_status !== "completed" || booking.amount_paid === 0) return "free";
  return now <= refundDeadline(startsAt).getTime() ? "refund" : "request";
}
