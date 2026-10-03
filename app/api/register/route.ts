import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasStarted, localeFrom, registerForEvent } from "@/lib/register-for-event";
import { sendConfirmationEmail } from "@/lib/send-confirmation-email";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { validateAttendee, validateBookingExtras } from "@/lib/validate-attendee";
import { closeCheckout, openCheckout } from "@/lib/stripe-checkout";
import { fulfilCheckout } from "@/lib/payments";

/**
 * Books a seat from the event page's form.
 *
 * A free event is booked and confirmed here. A paid one is booked as
 * `pending` and answered with the Stripe page to pay on (`checkoutUrl`): the
 * session is opened here, in the same request, so no booking is ever left
 * holding a seat with no way to pay for it, and nothing about the booking
 * comes back from the browser to start a payment (the old second step,
 * /api/stripe/checkout, took any registration id it was given: audit B11).
 *
 * One seat per email per event (audit B3), decided by register_for_event():
 * an address that already holds a seat is refused (`already_registered`); one
 * whose checkout is still unpaid is sent back to that checkout rather than
 * given a second seat.
 */
export async function POST(req: Request) {
  try {
    if (!rateLimit(`register:${clientIp(req)}`, 20)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    // `paymentStatus` is deliberately NOT read from the request body.
    //
    // It used to be, and was passed straight through to the database. That let
    // anyone post {"paymentStatus":"completed"} to this endpoint and be
    // recorded as having paid for a paid event — confirmation email, WhatsApp
    // group link and all — without ever reaching Stripe. The price lives in
    // the database, so the payment state is derived from it below and the
    // client gets no say.
    const body = await req.json();

    if (!body.captchaToken) {
      return NextResponse.json({ error: "Missing captcha token" }, { status: 400 });
    }

    const verified = await verifyTurnstile(body.captchaToken);
    if (!verified) {
      return NextResponse.json({ error: "Security check failed" }, { status: 400 });
    }

    // Shared with the waiting-list route so both apply identical rules; also
    // trims and lowercases, so use `value` from here on rather than `body`.
    const validation = validateAttendee(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { eventId, fullName, email, phone } = validation.value;

    // The note, its consent, and the marketing opt-in. A note arrives only
    // with its consent, or not at all.
    const extras = validateBookingExtras(body);
    if (!extras.ok) {
      return NextResponse.json({ error: extras.error, code: extras.code }, { status: 400 });
    }
    const locale = localeFrom(body.locale);

    const supabase = createAdminClient();

    // What this booking costs comes from the event row, never the request.
    // Unpublished events are rejected so a draft cannot be booked via a
    // guessed ID.
    const { data: eventRow, error: eventLookupError } = await supabase
      .from("events")
      .select("id, slug, title_ro, title_en, price, currency, starts_at")
      .eq("id", eventId)
      .eq("published", true)
      .single();

    if (eventLookupError || !eventRow) {
      return NextResponse.json({ error: "Event not found", code: "not_found" }, { status: 404 });
    }

    // Bookings close when the event starts. register_for_event() refuses as
    // well, and is the rule; this answers early and in the same terms.
    if (hasStarted(eventRow.starts_at)) {
      return NextResponse.json({ error: "Event has started", code: "started" }, { status: 409 });
    }

    const paymentStatus = eventRow.price > 0 ? "pending" : "free";

    const booking = await registerForEvent(supabase, {
      p_event_id: eventId,
      p_full_name: fullName,
      p_email: email,
      p_phone: phone,
      p_payment_status: paymentStatus,
      p_locale: locale,
      p_participant_note: extras.value.note ?? undefined,
      p_marketing_opt_in: extras.value.marketing,
    });

    // The code says why, so the page can say it in the visitor's language.
    if (!booking.ok) {
      const status = booking.code === "not_found" || booking.code === "unavailable" ? 404 : 409;
      return NextResponse.json({ error: booking.reason, code: booking.code }, { status });
    }

    if (paymentStatus === "free") {
      // Their unpaid checkout from when the event still cost money, now a
      // free booking: the old payment page must stop taking money.
      if (booking.resumed && booking.sessionId) await closeCheckout(booking.sessionId);
      await sendConfirmationEmail({
        registrationId: booking.id,
        eventId,
        fullName,
        email,
        locale,
        templateType: "registration_confirmation",
      });
      return NextResponse.json({ success: true, id: booking.id });
    }

    // Paid. The confirmation, with the WhatsApp link and the calendar invite,
    // waits for the money: lib/payments.ts sends it once Stripe says so.
    try {
      const opening = await openCheckout({
        event: eventRow,
        registrationId: booking.id,
        email,
        locale,
        previousSessionId: booking.sessionId,
      });
      if ("paid" in opening) {
        // They had already paid in a tab they left, and the webhook had not
        // arrived yet.
        await fulfilCheckout(opening.session);
        return NextResponse.json({ success: true, id: booking.id, paid: true });
      }
      return NextResponse.json({ success: true, id: booking.id, checkoutUrl: opening.url });
    } catch (stripeError) {
      console.error("Could not open the checkout:", stripeError);
      // A new booking nobody can pay for would hold a seat for an hour. A
      // resumed one keeps the session it had, which may still be paid.
      if (!booking.resumed) {
        const { error: releaseError } = await supabase
          .from("registrations")
          .delete()
          .eq("id", booking.id)
          .eq("payment_status", "pending");
        if (releaseError) console.error("Could not release the seat:", releaseError);
      }
      return NextResponse.json({ error: "Payment could not start", code: "stripe" }, { status: 502 });
    }
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
