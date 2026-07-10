import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { eventId, type, content } = await req.json();

    const supabase = createAdminClient();

    const { error } = await supabase.from("testimonials").insert({
      event_id: eventId,
      type,
      content,
      approved: false,
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Testimonial error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
