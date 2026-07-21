import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(req: Request) {
  try {
    const { eventId, fullName, email, phone, captchaToken } = await req.json();

    if (!eventId || !fullName || !email || !phone) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!captchaToken) {
      return NextResponse.json({ error: "Missing captcha token" }, { status: 400 });
    }

    const verified = await verifyTurnstile(captchaToken);
    if (!verified) {
      return NextResponse.json({ error: "Security check failed" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { count } = await supabase
      .from("waiting_list")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("email", email)
      .is("claimed_at", null);

    if (count && count > 0) {
      return NextResponse.json(
        { error: "Ești deja pe lista de așteptare pentru acest eveniment.", info: "You are already on the waiting list for this event." },
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
