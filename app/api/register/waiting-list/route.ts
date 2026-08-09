import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { validateAttendee } from "@/lib/validate-attendee";

/**
 * Adds someone to an event's waiting list.
 *
 * Reached when an event is full. If a spot later opens — a Stripe checkout
 * expires, or someone is refunded — the webhook emails the people on this list
 * a link to claim it.
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

    const supabase = createAdminClient();

    // Only published events have a waiting list worth joining.
    const { data: event } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .eq("published", true)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // `email` is already lowercased by validateAttendee, so this comparison
    // now catches "Ana@Gmail.com" against an existing "ana@gmail.com". It did
    // not before, which let one person join the same list several times.
    // `claimed_at is null` scopes it to people still waiting.
    const { count } = await supabase
      .from("waiting_list")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("email", email)
      .is("claimed_at", null);

    if (count && count > 0) {
      return NextResponse.json(
        {
          error: "Ești deja pe lista de așteptare pentru acest eveniment.",
          info: "You are already on the waiting list for this event.",
        },
        { status: 409 }
      );
    }

    const { error } = await supabase.from("waiting_list").insert({
      event_id: eventId,
      full_name: fullName,
      email,
      phone,
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Waiting list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
