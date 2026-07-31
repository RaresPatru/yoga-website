import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { eventId, registrationId, locale } = await req.json();

    if (!eventId || !registrationId || (locale !== "ro" && locale !== "en")) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title_ro, price, slug")
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
      .select("id, payment_status")
      .eq("id", registrationId)
      .eq("event_id", eventId)
      .single();

    if (!registration) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    if (registration.payment_status === "completed") {
      return NextResponse.json({ error: "Registration already paid" }, { status: 400 });
    }

    const stripe = getStripe();

    const origin = req.headers.get("origin")?.trim() || process.env.NEXT_PUBLIC_SITE_URL;
    let base: string;
    try {
      base = origin ? new URL(origin).origin : "";
    } catch {
      base = "";
    }
    if (!base) {
      return NextResponse.json({ error: "Missing origin" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "ron",
            product_data: {
              name: event.title_ro,
            },
            unit_amount: event.price * 100,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${base}/${locale}/events/${event.slug}?success=1`,
      cancel_url: `${base}/${locale}/events/${event.slug}?canceled=1`,
      metadata: { eventId, registrationId },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
