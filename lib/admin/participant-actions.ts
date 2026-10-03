/**
 * What the Registrations page can ask /api/admin/participants/[id] to do, and
 * the limits both sides check. Kept free of imports so the route and the page
 * can share it.
 */

export type ParticipantAction =
  | "remove"
  | "refund_requested"
  | "refund_cleared"
  | "refunded"
  | "refund_settled"
  | "details";

/** The longest reason for a removal, in characters. */
export const REMOVAL_REASON_MAX = 500;

export interface ParticipantActionResult {
  ok: true;
  /** For a removal or new details: whether the email went, or null when she did not ask for one. */
  emailed?: boolean | null;
  /** How many people on the waiting list were offered a freed seat. */
  offered?: number;
  /** For a refund: whether Stripe returned the money (true) or she only marked it (false). */
  throughStripe?: boolean;
}

/**
 * New details for a booking: the person she gives the place to, or a
 * correction. `emailAddress` rather than `email`, which the removal already
 * uses for "email them".
 */
export interface ParticipantDetails {
  fullName: string;
  emailAddress: string;
  phone: string;
  /** Send the new person the confirmation, with a cancel link of their own. */
  sendConfirmation?: boolean;
}
