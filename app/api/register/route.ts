import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { eventId, fullName, email, phone } = await req.json();

    const supabase = createAdminClient();

    const { error } = await supabase.from("registrations").insert({
      event_id: eventId,
      full_name: fullName,
      email,
      phone,
      payment_status: "free",
    });

    if (error) throw error;

    // Send confirmation email (configured later)
    // await resend.emails.send({ ... });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
