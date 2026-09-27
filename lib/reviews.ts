import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl } from "@/lib/site-config";
import { EVENT_TIME_ZONE, formatDate } from "@/lib/utils";
import {
  emailLocale,
  eventEmailVars,
  fillEmailTemplate,
  loadTemplate,
  sendEmail,
  type EmailLocale,
} from "@/lib/email";

/**
 * Verified reviews: who may write a testimonial, and the personal links that
 * let them.
 *
 * A testimonial can only be written through a link sent to the email someone
 * booked with, so each one comes from a person who booked that event (the EU
 * Omnibus rules ask a site to say how it checks this; /testimonials does).
 * The link carries a random token; the database keeps only its SHA-256, so a
 * copy of the table hands out no working links. A link works once and lapses
 * after 60 days.
 *
 * Links go out three ways:
 *
 *   - the morning after an event ends, from the daily job, unless she has
 *     turned invitations off in Conținut site (sendDueReviewInvitations);
 *   - when she presses "Trimite invitațiile" on an ended event
 *     (inviteEventParticipants);
 *   - when someone asks on /testimonials/share with the email they booked
 *     with (requestReviewLinks).
 *
 * Server only: it uses the service key.
 */

export const REVIEW_LINK_DAYS = 60;
/** The longest testimonial, counted in characters of text, not markup. */
export const REVIEW_TEXT_MAX = 2000;
export const REVIEW_TEXT_MIN = 10;
/** How long after an event ends the daily job still invites for it. */
const INVITE_WINDOW_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A booking's fields that decide whether it may leave a testimonial. */
export interface BookingState {
  removed_at: string | null;
  payment_status: string;
  refund_requested_at: string | null;
}

/**
 * Who may write: a booking that was free or paid, not cancelled, and with no
 * refund asked for or made. Someone who got their money back did not come,
 * as far as the site knows.
 */
export function mayReview(b: BookingState): boolean {
  return !b.removed_at && (b.payment_status === "free" || b.payment_status === "completed") && !b.refund_requested_at;
}

/** "Ana Maria Popescu" as she may choose to be shown: in full, or "Ana P.". */
export function displayNames(fullName: string): { full: string; short: string } {
  const full = fullName.trim().replace(/\s+/g, " ");
  const parts = full.split(" ");
  const short = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : full;
  return { full, short };
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/** The event columns an invitation needs. */
interface InviteEvent {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  date: string;
  time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  ends_at: string;
}

interface InviteBooking {
  id: string;
  full_name: string;
  email: string;
  locale: string;
}

const EVENT_COLUMNS = "id, slug, title_ro, title_en, date, time, end_date, end_time, location, ends_at";

/** A moment as the email writes it: "25 noiembrie 2026, 18:00", Romanian time. */
function emailMoment(date: Date, locale: EmailLocale): string {
  return date.toLocaleString(locale === "en" ? "en-GB" : "ro-RO", {
    timeZone: EVENT_TIME_ZONE,
    dateStyle: "long",
    timeStyle: "short",
  });
}

/**
 * Creates a personal link for one booking and emails it, in the language they
 * booked in. Returns whether the email went; a link whose email failed is
 * deleted again, so nothing is left that nobody received.
 */
async function invite(booking: InviteBooking, event: InviteEvent): Promise<boolean> {
  const supabase = createAdminClient();
  const locale = emailLocale(booking.locale);
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + REVIEW_LINK_DAYS * DAY_MS);

  const { data: row, error } = await supabase
    .from("review_invitations")
    .insert({ registration_id: booking.id, token_hash: hashToken(token), expires_at: expires.toISOString() })
    .select("id")
    .single();
  if (error || !row) {
    console.error("Could not create a review link:", error);
    return false;
  }

  const template = await loadTemplate(supabase, "testimonial_request", locale);
  const vars = {
    user_name: firstName(booking.full_name),
    ...eventEmailVars(event, locale),
    testimonial_link: absoluteUrl(`/${locale}/testimonials/write?token=${token}`),
    expires_at: emailMoment(expires, locale),
  };
  const result = template
    ? await sendEmail({
        to: booking.email,
        subject: fillEmailTemplate(template.subject, vars),
        html: fillEmailTemplate(template.body, vars),
      })
    : { ok: false as const, error: "No 'testimonial_request' template" };

  if (!result.ok) {
    console.error(`Review link email failed for booking ${booking.id}:`, result.error);
    await supabase.from("review_invitations").delete().eq("id", row.id);
    return false;
  }
  return true;
}

/**
 * Bookings on an event that may write and have not: eligible, without a
 * testimonial, and without a link that still works (unless `evenIfInvited`).
 */
async function uninvited(eventId: string, evenIfInvited: boolean): Promise<InviteBooking[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("registrations")
    .select("id, full_name, email, locale, removed_at, payment_status, refund_requested_at, testimonials(id), review_invitations(used_at, expires_at)")
    .eq("event_id", eventId);
  if (error) throw error;
  const now = Date.now();
  return (data ?? []).filter((b) => {
    if (!mayReview(b) || (b.testimonials ?? []).length > 0) return false;
    if (evenIfInvited) return true;
    return !(b.review_invitations ?? []).some((i) => !i.used_at && Date.parse(i.expires_at) > now);
  });
}

async function inviteAll(event: InviteEvent, evenIfInvited: boolean) {
  let invited = 0;
  let failed = 0;
  for (const booking of await uninvited(event.id, evenIfInvited)) {
    if (await invite(booking, event)) invited++;
    else failed++;
  }
  return { invited, failed };
}

/** Whether she has left automatic invitations on (Conținut site → Testimoniale). */
async function invitationsOn(): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("site_content")
    .select("value_ro")
    .eq("key", "testimonials.invitations")
    .maybeSingle();
  return data?.value_ro !== "off";
}

/**
 * The morning after: every event that ended in the last three days, and each
 * of its eligible bookings that has no link yet. Three days rather than one,
 * so a missed run is made up the next morning; bookings already invited are
 * skipped, so no one is written to twice.
 */
export async function sendDueReviewInvitations(): Promise<{ invited: number; failed: number; off?: true }> {
  if (!(await invitationsOn())) return { invited: 0, failed: 0, off: true };
  const supabase = createAdminClient();
  const now = new Date();
  const { data: events, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("published", true)
    .lte("ends_at", now.toISOString())
    .gt("ends_at", new Date(now.getTime() - INVITE_WINDOW_DAYS * DAY_MS).toISOString());
  if (error) throw error;

  let invited = 0;
  let failed = 0;
  for (const event of events ?? []) {
    const result = await inviteAll(event, false);
    invited += result.invited;
    failed += result.failed;
  }
  return { invited, failed };
}

/**
 * Her button on an ended event: a link for everyone eligible who has not
 * written yet and holds no working link. Works whatever the switch says,
 * because she pressed it.
 */
export async function inviteEventParticipants(
  eventId: string
): Promise<{ invited: number; failed: number } | { refused: "not_found" | "not_ended" }> {
  const { data: event, error } = await createAdminClient()
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!event) return { refused: "not_found" };
  if (Date.parse(event.ends_at) > Date.now()) return { refused: "not_ended" };
  return inviteAll(event, false);
}

/**
 * Someone asked on /testimonials/share. For each of their bookings that may
 * write: a fresh link if the event is over, or a note saying when they can
 * write if it is not. Anything else, including an email nobody booked with,
 * gets nothing, and the page says the same thing either way, so it cannot be
 * used to learn who booked what.
 *
 * At most three of each, most recent first: enough for anyone real, and a
 * ceiling on what one request can send.
 */
export async function requestReviewLinks(email: string): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("registrations")
    .select(`id, full_name, email, locale, removed_at, payment_status, refund_requested_at, testimonials(id), events!inner(${EVENT_COLUMNS}, published)`)
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .order("created_at", { ascending: false });
  if (error) throw error;

  const now = Date.now();
  const candidates = (data ?? []).filter(
    (b) => mayReview(b) && (b.testimonials ?? []).length === 0 && b.events?.published
  );
  const ended = candidates.filter((b) => Date.parse(b.events.ends_at) <= now).slice(0, 3);
  const early = candidates.filter((b) => Date.parse(b.events.ends_at) > now).slice(0, 3);

  for (const booking of ended) await invite(booking, booking.events);

  for (const booking of early) {
    const locale = emailLocale(booking.locale);
    const template = await loadTemplate(supabase, "review_too_early", locale);
    if (!template) continue;
    const event = booking.events;
    const vars = {
      user_name: firstName(booking.full_name),
      ...eventEmailVars(event, locale),
      event_end: formatDate(event.end_date || event.date, locale),
    };
    const result = await sendEmail({
      to: booking.email,
      subject: fillEmailTemplate(template.subject, vars),
      html: fillEmailTemplate(template.body, vars),
    });
    if (!result.ok) console.error(`Too-early review email failed for booking ${booking.id}:`, result.error);
  }
}

/** Why a link cannot be used. */
export type LinkRefusal = "invalid" | "used" | "expired";

export interface OpenInvitation {
  invitationId: string;
  registrationId: string;
  fullName: string;
  locale: EmailLocale;
  event: { id: string; slug: string; title_ro: string; title_en: string | null; date: string };
}

/**
 * The invitation behind a token, if it can still be used: not used, not
 * lapsed, the booking still allowed to write and without a testimonial, its
 * event over. Every "no" is one of three answers, and a token that matches
 * nothing is "invalid", like one whose booking was since refunded.
 */
export async function openInvitation(
  token: string | null | undefined
): Promise<{ ok: true; invitation: OpenInvitation } | { ok: false; reason: LinkRefusal }> {
  if (!token || token.length < 20 || token.length > 100) return { ok: false, reason: "invalid" };
  const { data, error } = await createAdminClient()
    .from("review_invitations")
    .select(
      "id, expires_at, used_at, registrations!inner(id, full_name, locale, removed_at, payment_status, refund_requested_at, testimonials(id), events!inner(id, slug, title_ro, title_en, date, ends_at))"
    )
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: "invalid" };

  const booking = data.registrations;
  if (data.used_at || (booking.testimonials ?? []).length > 0) return { ok: false, reason: "used" };
  if (Date.parse(data.expires_at) <= Date.now()) return { ok: false, reason: "expired" };
  if (!mayReview(booking) || Date.parse(booking.events.ends_at) > Date.now()) return { ok: false, reason: "invalid" };

  const { id, slug, title_ro, title_en, date } = booking.events;
  return {
    ok: true,
    invitation: {
      invitationId: data.id,
      registrationId: booking.id,
      fullName: booking.full_name,
      locale: emailLocale(booking.locale),
      event: { id, slug, title_ro, title_en, date },
    },
  };
}
