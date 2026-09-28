import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { validateAttendee, validateBookingExtras } from "@/lib/validate-attendee";
import { hasStarted, localeFrom } from "@/lib/register-for-event";
import { siteUrl } from "@/lib/site-config";
import { eventEmailVars } from "@/lib/email-content";
import { sendTemplateEmail } from "@/lib/email";

/**
 * Adds someone to an event's waiting list.
 *
 * Reached when an event is full. If a spot later opens — a Stripe checkout
 * expires, someone is refunded or removed, or she adds places — the people on
 * this list are emailed a link to claim it, oldest entry first.
 *
 * Refused once the event has started: nobody can be offered a seat after
 * that, so a place in the queue would be a promise nothing can keep.
 *
 * They are emailed a confirmation (waitlist_joined), in the language of the
 * page they joined on, so they know it worked and what happens next. The
 * place in the queue does not depend on that email going.
 */
export async function POST(req: Request) {
  try {
    if (!rateLimit(`waiting-list:${clientIp(req)}`, 20)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();

    // CAPTCHA before anything else. Checking it first means a bot's request is
    // dropped before it costs us a database round trip.
    if (!body.captchaToken) {
      return NextResponse.json({ error: "Missing captcha token" }, { status: 400 });
    }

    if (!(await verifyTurnstile(body.captchaToken))) {
      return NextResponse.json({ error: "Security check failed" }, { status: 400 });
    }

    // Same rules as /api/register. This route previously did no validation at
    // all beyond "is the field present?".
    const validation = validateAttendee(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { eventId, fullName, email, phone } = validation.value;

    // The same note, consent and opt-in as the booking form. They travel to
    // the booking if this person later claims a seat.
    const extras = validateBookingExtras(body);
    if (!extras.ok) {
      return NextResponse.json({ error: extras.error, code: extras.code }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Only published events have a waiting list worth joining.
    const { data: event } = await supabase
      .from("events")
      .select("id, slug, title_ro, title_en, date, time, end_date, end_time, location, starts_at")
      .eq("id", eventId)
      .eq("published", true)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found", code: "not_found" }, { status: 404 });
    }

    if (hasStarted(event.starts_at)) {
      return NextResponse.json({ error: "Event has started", code: "started" }, { status: 409 });
    }

    // `email` is already lowercased by validateAttendee, so this comparison
    // now catches "Ana@Gmail.com" against an existing "ana@gmail.com". It did
    // not before, which let one person join the same list several times.
    // `claimed_at is null` scopes it to people still waiting, and someone
    // she took off the list may join it again.
    const { count } = await supabase
      .from("waiting_list")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("email", email)
      .is("claimed_at", null)
      .is("removed_at", null);

    if (count && count > 0) {
      return NextResponse.json(
        {
          error: "Ești deja pe lista de așteptare pentru acest eveniment.",
          info: "You are already on the waiting list for this event.",
          code: "already_waiting",
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const locale = localeFrom(body.locale);
    const { error } = await supabase.from("waiting_list").insert({
      event_id: eventId,
      full_name: fullName,
      email,
      phone,
      locale,
      participant_note: extras.value.note,
      note_consent_at: extras.value.note ? now : null,
      marketing_consent_at: extras.value.marketing ? now : null,
    });

    if (error) throw error;

    const confirmation = await sendTemplateEmail({
      type: "waitlist_joined",
      locale,
      to: email,
      vars: { user_name: fullName, ...eventEmailVars(event, locale, siteUrl()) },
    });
    if (!confirmation.ok) console.error("Waiting-list confirmation email failed:", confirmation.error);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Waiting list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
