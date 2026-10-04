/**
 * Shared validation for the two public forms that collect attendee details:
 * event registration and the waiting list.
 *
 * These two routes ask for exactly the same four fields, but only /api/register
 * ever validated them. The waiting-list route checked that the fields were
 * merely present, so a 5,000-character "name" or a string that is not an email
 * address went straight into the database. Putting the rules in one place means
 * they cannot drift apart again.
 *
 * WHY VALIDATE ON THE SERVER WHEN THE FORM ALREADY DOES?
 *
 * Because the browser form is a convenience, not a control. Anyone can send a
 * request straight to the API with curl and skip the form entirely. Client-side
 * validation exists to give fast feedback to honest users; server-side
 * validation exists to make guarantees. You need both, and they are not
 * redundant.
 */

// Deliberately loose. Email addresses are far stranger than most patterns
// allow, and rejecting a valid-but-unusual address is worse than accepting a
// malformed one — the confirmation email simply bounces. This checks the shape
// only: something, an @, something, a dot, a couple more characters.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface AttendeeInput {
  eventId?: unknown;
  fullName?: unknown;
  email?: unknown;
  phone?: unknown;
}

export interface ValidAttendee {
  eventId: string;
  fullName: string;
  email: string;
  phone: string;
}

export type AttendeeValidation =
  | { ok: true; value: ValidAttendee }
  | { ok: false; error: string };

/**
 * Checks and normalises attendee details.
 *
 * On success the returned values are already cleaned up — trimmed, and the
 * email lowercased — so callers should use `value` rather than the raw input.
 * Lowercasing matters more than it looks: the waiting list rejects duplicate
 * sign-ups by comparing email addresses, and "Ana@Gmail.com" and "ana@gmail.com"
 * are the same inbox but different strings. Without normalising, the same
 * person could sit on the waiting list several times and receive several
 * notification emails.
 */
export function validateAttendee(input: AttendeeInput): AttendeeValidation {
  const { eventId, fullName, email, phone } = input;

  if (!eventId || typeof eventId !== "string") {
    return { ok: false, error: "Missing required fields" };
  }

  if (
    !fullName ||
    typeof fullName !== "string" ||
    fullName.trim().length < 2 ||
    fullName.trim().length > 100
  ) {
    return { ok: false, error: "Invalid name" };
  }

  if (
    !email ||
    typeof email !== "string" ||
    email.length > 254 || // the maximum length an email address may be
    !EMAIL_RE.test(email.trim())
  ) {
    return { ok: false, error: "Invalid email" };
  }

  // Only the digits are counted, because the value arrives formatted for
  // display ("+40 722 111 222"). Six is a deliberately low floor — the real
  // check happens in the browser via libphonenumber-js, which knows the rules
  // per country. This is a backstop against empty or obviously fake input.
  if (!phone || typeof phone !== "string" || phone.replace(/\D/g, "").length < 6) {
    return { ok: false, error: "Invalid phone number" };
  }

  return {
    ok: true,
    value: {
      eventId,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
    },
  };
}

/** The longest note the booking forms accept, in characters. */
export const NOTE_MAX_LENGTH = 1000;

export interface BookingExtrasInput {
  note?: unknown;
  noteConsent?: unknown;
  marketing?: unknown;
}

export interface BookingExtras {
  /** Their note, trimmed, or null. Only ever set together with their consent to keep it. */
  note: string | null;
  /** Whether they ticked "tell me about future events". */
  marketing: boolean;
}

/**
 * The optional part of the booking and waiting-list forms: a note ("Ceva ce
 * ar trebui să știu?") and the marketing opt-in.
 *
 * A note is often about health, which GDPR lets us keep only with explicit
 * consent, so a note without the consent box ticked is refused rather than
 * stored or silently dropped: the form says why, and they can tick it or
 * delete the note. The database refuses a note without a consent time too
 * (registrations_note_needs_consent); this answers first, in words.
 *
 * Only `true` counts as a tick. A missing field is no, never yes.
 */
export function validateBookingExtras(
  input: BookingExtrasInput
): { ok: true; value: BookingExtras } | { ok: false; error: string; code: "note_too_long" | "note_needs_consent" } {
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > NOTE_MAX_LENGTH) {
    return { ok: false, error: "Note too long", code: "note_too_long" };
  }
  if (note && input.noteConsent !== true) {
    return { ok: false, error: "A note needs consent", code: "note_needs_consent" };
  }
  return { ok: true, value: { note: note || null, marketing: input.marketing === true } };
}
