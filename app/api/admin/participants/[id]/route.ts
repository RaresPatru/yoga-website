import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/is-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyWaitingList } from "@/lib/notify-waiting-list";
import { sendRemovalEmail } from "@/lib/send-removal-email";
import { emailLocale } from "@/lib/email-content";
import { REMOVAL_REASON_MAX, type ParticipantAction } from "@/lib/admin/participant-actions";

/**
 * What she can do to one participant from the Registrations page, where it
 * needs more than a row update: an email sent in her name, or a freed seat
 * offered to the waiting list. Both need the server's keys, so every change
 * of state goes through here, and the page only writes her own note directly.
 *
 *   remove            Takes a booking or a waiting-list entry off the event,
 *                     with her reason, and emails the person if she asked.
 *   refund_requested  Marks that a paid booking asked for its money back.
 *   refund_cleared    Takes that mark off again.
 *   refunded          Marks the money as returned: the booking no longer
 *                     holds its seat.
 *
 * Refunds are marked by hand until the Stripe phase makes them real.
 *
 * Whenever a seat may have come free (a removal, a refund) the waiting list
 * is offered it, if the event has not started. notifyWaitingList() counts the
 * seats itself, so a removal that frees nothing emails nobody.
 */

const ACTIONS: readonly ParticipantAction[] = ["remove", "refund_requested", "refund_cleared", "refunded"];
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
      .select("id, event_id, full_name, email, locale, payment_status, refund_requested_at, removed_at, events!inner(starts_at)")
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

    // The refund marks are for paid bookings only.
    if (!booking || booking.removed_at || booking.payment_status !== "completed") {
      return NextResponse.json({ error: "Not a paid booking", code: "state" }, { status: 409 });
    }

    if (action === "refunded") {
      const { error } = await supabase
        .from("registrations")
        .update({ payment_status: "refunded" })
        .eq("id", id)
        .eq("payment_status", "completed");
      if (error) throw error;
      return NextResponse.json({ ok: true, offered: await offerSeats() });
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
