import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { createCheckoutSession } from "@/lib/stripe-checkout";

/**
 * Starts payment for a paid booking: returns the Stripe-hosted page the
 * visitor is sent to.
 *
 * The browser supplies only ids and a language. Everything that decides what
 * is charged (price, currency, event title) is read from the database here.
 */
export async function POST(req: Request) {
  try {
    // Every call creates a real Stripe Checkout session. Unthrottled, that is
    // an open invitation to burn through API quota and fill the Stripe
    // dashboard with junk. 20 per IP per 10 minutes is far more than a genuine
    // person needs to complete one booking.
    if (!rateLimit(`checkout:${clientIp(req)}`, 20)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const { eventId, registrationId, locale } = await req.json();

    if (!eventId || !registrationId || (locale !== "ro" && locale !== "en")) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, slug, title_ro, title_en, price, currency")
      .eq("id", eventId)
      .eq("published", true)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!event.price || event.price <= 0) {
      return NextResponse.json({ error: "Event is free" }, { status: 400 });
    }

    const { data: registration } = await supabase
      .from("registrations")
      .select("id, email, payment_status")
      .eq("id", registrationId)
      .eq("event_id", eventId)
      .single();

    if (!registration) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    if (registration.payment_status === "completed") {
      return NextResponse.json({ error: "Registration already paid" }, { status: 400 });
    }

    const url = await createCheckoutSession({
      event,
      registrationId: registration.id,
      email: registration.email,
      locale,
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
