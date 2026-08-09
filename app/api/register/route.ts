import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendConfirmationEmail } from "@/lib/send-confirmation-email";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { validateAttendee } from "@/lib/validate-attendee";

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

    const supabase = createAdminClient();

    // Look up the event to decide what this registration costs. A free event
    // (price 0) is confirmed immediately; a paid one starts as 'pending' and is
    // only flipped to 'completed' by the Stripe webhook once money actually
    // arrives. Unpublished events are rejected so a draft cannot be booked via
    // a guessed ID.
    const { data: eventRow, error: eventLookupError } = await supabase
      .from("events")
      .select("id, price")
      .eq("id", eventId)
      .eq("published", true)
      .single();

    if (eventLookupError || !eventRow) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const paymentStatus = eventRow.price > 0 ? "pending" : "free";

    const { data: rpcResult, error: rpcError } = await supabase.rpc("register_for_event", {
      p_event_id: eventId,
      p_full_name: fullName,
      p_email: email,
      p_phone: phone,
      p_payment_status: paymentStatus,
    });

    if (rpcError) throw rpcError;

    if (rpcResult?.error) {
      return NextResponse.json(
        { error: rpcResult.error },
        { status: 409 }
      );
    }

    const registration = rpcResult;

    // Only free events are confirmed here. For a paid event the registration is
    // still 'pending' at this point — the visitor is about to be sent to Stripe
    // — so the confirmation (which contains the WhatsApp link and the calendar
    // invite) is sent by the Stripe webhook once the payment clears.
    if (paymentStatus === "free") {
      await sendConfirmationEmail({
        eventId,
        fullName,
        email,
        templateType: "registration_confirmation",
      });
    }

    return NextResponse.json({ success: true, id: registration.id });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
