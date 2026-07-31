import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    if (!rateLimit(`testimonials:${clientIp(req)}`, 10)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const { eventId, type, content, captchaToken } = await req.json();

    if (!captchaToken) {
      return NextResponse.json({ error: "Missing captcha token" }, { status: 400 });
    }

    const verified = await verifyTurnstile(captchaToken);
    if (!verified) {
      return NextResponse.json({ error: "Security check failed" }, { status: 400 });
    }

    if (!eventId || typeof eventId !== "string") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (type !== "text" && type !== "video") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    if (
      !content ||
      typeof content !== "string" ||
      content.trim().length < 5 ||
      content.trim().length > 2000
    ) {
      return NextResponse.json({ error: "Content must be between 5 and 2000 characters" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { error } = await supabase.from("testimonials").insert({
      event_id: eventId,
      type,
      content: content.trim(),
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
