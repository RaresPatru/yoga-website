import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/is-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyWaitingList } from "@/lib/notify-waiting-list";
import { sendRemovalEmail } from "@/lib/send-removal-email";
import { sendConfirmationEmail } from "@/lib/send-confirmation-email";
import { emailLocale } from "@/lib/email-content";
import { refundBooking } from "@/lib/payments";
import { validateAttendee } from "@/lib/validate-attendee";
import { REMOVAL_REASON_MAX, type ParticipantAction } from "@/lib/admin/participant-actions";

/**
 * What she can do to one participant from the Registrations page, where it
 * needs more than a row update: Stripe, an email sent in her name, or a freed
 * seat offered to the waiting list. All three need the server's keys, so
 * every change of state goes through here, and the page only writes her own
 * note directly.
 *
 *   remove            Takes a booking or a waiting-list entry off the event,
 *                     with her reason, and emails the person if she asked.
 *   refund_requested  Marks that a paid booking asked for its money back.
 *   refund_cleared    Takes that mark off again: on a booking they cancelled
 *                     themselves, this is her declining the refund.
 *   refunded          Returns the money. A booking paid through Stripe is
 *                     refunded there, in full (Rares: never partial); one
 *                     with no Stripe payment behind it is only marked, for
 *                     money she returned some other way. Either way the
 *                     booking no longer holds its seat.
 *   refund_settled    A refund Stripe could not return (refund_failed_at) has
 *                     been settled another way: the warning goes.
 *   details           New name, email and phone on a booking: a correction,
 *                     or the person they gave their place to (the terms let
 *                     someone pass a paid place on through her). The old
 *                     cancel link stops working, and the new person can be
 *                     sent the confirmation with a link of their own.
 *
 * Whenever a seat may have come free (a removal, a refund) the waiting list
 * is offered it, if the event has not started. notifyWaitingList() counts the
 * seats itself, so a removal that frees nothing emails nobody.
 */

const ACTIONS: readonly ParticipantAction[] = [
  "remove",
  "refund_requested",
  "refund_cleared",
  "refunded",
  "refund_settled",
  "details",
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!UUID.test(id)) {
      return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const action = body?.action as ParticipantAction;
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Unknown action", code: "invalid" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { data: booking, error: bookingError } = await supabase
      .from("registrations")
      .select("id, event_id, full_name, email, phone, locale, payment_status, refund_requested_at, refund_failed_at, removed_at, cancelled_at, events!inner(starts_at)")
      .eq("id", id)
      .maybeSingle();
    if (bookingError) throw bookingError;

    const { data: waiting, error: waitingError } = booking
      ? { data: null, error: null }
      : await supabase
          .from("waiting_list")
          .select("id, event_id, full_name, email, locale, removed_at, claimed_at, events!inner(starts_at)")
          .eq("id", id)
          .is("claimed_at", null)
          .maybeSingle();
    if (waitingError) throw waitingError;

    const person = booking ?? waiting;
    if (!person) {
      return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
    }
    const event = Array.isArray(person.events) ? person.events[0] : person.events;
    const open = Boolean(event && Date.parse(event.starts_at) > Date.now());

    /** A seat may be free: offer it, and say how many were emailed. */
    const offerSeats = async () => (open ? notifyWaitingList(person.event_id) : 0);

    if (action === "remove") {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason || reason.length > REMOVAL_REASON_MAX) {
        return NextResponse.json({ error: "A reason is required", code: "reason" }, { status: 400 });
      }
      if (person.removed_at) {
        return NextResponse.json({ error: "Already removed", code: "state" }, { status: 409 });
      }

      const removal = { removed_at: now, removal_reason: reason };
      const { data: removed, error } = booking
        ? await supabase.from("registrations").update(removal).eq("id", id).is("removed_at", null).select("id")
        : await supabase.from("waiting_list").update(removal).eq("id", id).is("removed_at", null).select("id");
      if (error) throw error;
      if (!removed?.length) {
        return NextResponse.json({ error: "Already removed", code: "state" }, { status: 409 });
      }

      const emailed =
        body.email === true
          ? await sendRemovalEmail({
              kind: booking ? "booking" : "waitlist",
              eventId: person.event_id,
              fullName: person.full_name,
              email: person.email,
              locale: emailLocale(person.locale),
            })
          : null;

      return NextResponse.json({ ok: true, emailed, offered: await offerSeats() });
    }

    if (!booking || booking.removed_at) {
      return NextResponse.json({ error: "Not a booking", code: "state" }, { status: 409 });
    }

    if (action === "details") return changeDetails(booking, body);

    if (action === "refund_settled") {
      const { error } = await supabase.from("registrations").update({ refund_failed_at: null }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // The refund marks and the refund itself are for paid bookings only.
    if (booking.payment_status !== "completed") {
      return NextResponse.json({ error: "Not a paid booking", code: "state" }, { status: 409 });
    }

    if (action === "refunded") {
      const outcome = await refundBooking(id);
      if (outcome.ok) {
        return NextResponse.json({ ok: true, throughStripe: true, offered: await offerSeats() });
      }
      if (outcome.reason === "stripe") {
        return NextResponse.json({ error: outcome.message, code: "stripe" }, { status: 502 });
      }
      if (outcome.reason === "state") {
        return NextResponse.json({ error: "Not a paid booking", code: "state" }, { status: 409 });
      }
      // No Stripe payment behind it: she returned the money herself.
      const { error } = await supabase
        .from("registrations")
        .update({ payment_status: "refunded", refunded_at: now })
        .eq("id", id)
        .eq("payment_status", "completed");
      if (error) throw error;
      return NextResponse.json({ ok: true, throughStripe: false, offered: await offerSeats() });
    }

    const { error } = await supabase
      .from("registrations")
      .update({ refund_requested_at: action === "refund_requested" ? now : null })
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Participant action failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * New name, email and phone on a booking, checked by the booking form's own
 * rules. The one-seat-per-email rule still holds: an address that already has
 * a seat on the event cannot be given a second. The old cancel link stops
 * working, since it belonged to the person who had the place before, and the
 * new one comes with the confirmation when she sends it.
 */
async function changeDetails(
  booking: { id: string; event_id: string; email: string; locale: string; payment_status: string; cancelled_at: string | null },
  body: Record<string, unknown>
) {
  if (booking.cancelled_at || (booking.payment_status !== "free" && booking.payment_status !== "completed")) {
    return NextResponse.json({ error: "Not an active booking", code: "state" }, { status: 409 });
  }
  const validation = validateAttendee({
    eventId: booking.event_id,
    fullName: body.fullName,
    email: body.emailAddress,
    phone: body.phone,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error, code: "invalid" }, { status: 400 });
  }
  const { fullName, email, phone } = validation.value;
  const supabase = createAdminClient();

  if (email !== booking.email.toLowerCase()) {
    const { count, error } = await supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", booking.event_id)
      .eq("email", email)
      .neq("id", booking.id)
      .in("payment_status", ["free", "completed", "pending"])
      .is("removed_at", null)
      .is("cancelled_at", null);
    if (error) throw error;
    if (count && count > 0) {
      return NextResponse.json({ error: "That address already has a seat", code: "already_registered" }, { status: 409 });
    }
  }

  const { error } = await supabase
    .from("registrations")
    .update({ full_name: fullName, email, phone, cancel_token_hash: null })
    .eq("id", booking.id);
  if (error) throw error;

  const emailed =
    body.sendConfirmation === true
      ? await sendConfirmationEmail({
          registrationId: booking.id,
          eventId: booking.event_id,
          fullName,
          email,
          locale: emailLocale(booking.locale),
          templateType: "registration_confirmation",
        })
      : null;
  return NextResponse.json({ ok: true, emailed });
}
