/**
 * What the Registrations page can ask /api/admin/participants/[id] to do, and
 * the limits both sides check. Kept free of imports so the route and the page
 * can share it.
 */

export type ParticipantAction = "remove" | "refund_requested" | "refund_cleared" | "refunded";

/** The longest reason for a removal, in characters. */
export const REMOVAL_REASON_MAX = 500;

export interface ParticipantActionResult {
  ok: true;
  /** For a removal: whether the email went, or null when she did not ask for one. */
  emailed?: boolean | null;
  /** How many people on the waiting list were offered a freed seat. */
  offered?: number;
}
